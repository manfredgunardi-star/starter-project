-- Bonus supir & pengurus: aturan, standar bongkar material, akun, dan pencarian aturan berlaku.

alter table public.material add column standar_bongkar numeric(12,3) check (standar_bongkar > 0);

create table public.aturan_bonus (
  id uuid primary key default gen_random_uuid(),
  nama text not null check (length(trim(nama)) > 0),
  jenis text not null check (jenis in ('rit_harian_supir', 'rit_bulanan_supir', 'tonase_supir', 'rit_bulanan_pengurus')),
  ambang int check (ambang >= 1),
  nominal numeric(18,2) not null check (nominal >= 0),
  berlaku_mulai date not null,
  aktif boolean not null default true,
  -- Bonus tonase memakai material.standar_bongkar sebagai pembanding, bukan ambang jumlah rit.
  check ((jenis = 'tonase_supir') = (ambang is null))
);
create unique index aturan_bonus_unik on public.aturan_bonus (jenis, berlaku_mulai) where aktif;

-- Jalur baca utama hitung_bonus; index yang ada hanya menutup tanggal berangkat.
create index surat_jalan_selesai_idx on public.surat_jalan (tanggal_selesai, supir_id) where status = 'selesai';

insert into public.akun (kode, nama, induk_kode, tipe, saldo_normal, kas_bank) values
  ('5135', 'Bonus Sopir & Pengurus', '5100', 'detail', 'debit', false),
  ('2126', 'Hutang Bonus', '2120', 'detail', 'kredit', false);

alter table public.pengaturan_posting drop constraint pengaturan_posting_kunci_check;
alter table public.pengaturan_posting add constraint pengaturan_posting_kunci_check check (kunci in (
  'piutang_usaha', 'pendapatan_jasa', 'beban_uang_jalan', 'beban_upah_sopir', 'hutang_upah_sopir', 'beban_pph_final',
  'beban_komisi_pengurus', 'hutang_komisi_pengurus', 'beban_bonus', 'hutang_bonus'));
insert into public.pengaturan_posting (kunci, akun_kode, keterangan) values
  ('beban_bonus', '5135', 'Bonus supir & pengurus diakui saat bonus periode diposting'),
  ('hutang_bonus', '2126', 'Hutang bonus sampai dibayar');

alter table public.jurnal drop constraint jurnal_sumber_tipe_check;
alter table public.jurnal add constraint jurnal_sumber_tipe_check check (sumber_tipe in (
  'saldo_awal', 'sj_selesai', 'invoice', 'pembayaran', 'kas', 'manual', 'pembalik', 'bonus'));

-- ---------- RPC master ----------

create function public.simpan_aturan_bonus(
  p_id uuid, p_nama text, p_jenis text, p_ambang int, p_nominal numeric, p_berlaku_mulai date,
  p_aktif boolean default true)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  perform internal.wajib_peran('owner', 'keuangan');
  if p_berlaku_mulai is null then
    raise exception 'Tanggal berlaku wajib diisi' using errcode = 'P0001';
  end if;
  if p_jenis = 'tonase_supir' and p_ambang is not null then
    raise exception 'Bonus tonase memakai standar bongkar material; ambang harus dikosongkan' using errcode = 'P0001';
  end if;
  if p_jenis is distinct from 'tonase_supir' and coalesce(p_ambang, 0) < 1 then
    raise exception 'Ambang jumlah rit minimal 1' using errcode = 'P0001';
  end if;
  if p_id is null then
    insert into public.aturan_bonus (nama, jenis, ambang, nominal, berlaku_mulai, aktif)
    values (trim(p_nama), p_jenis, p_ambang, p_nominal, p_berlaku_mulai, coalesce(p_aktif, true))
    returning id into v_id;
  else
    update public.aturan_bonus
       set nama = trim(p_nama), jenis = p_jenis, ambang = p_ambang, nominal = p_nominal,
           berlaku_mulai = p_berlaku_mulai, aktif = coalesce(p_aktif, true)
     where id = p_id returning id into v_id;
    if v_id is null then
      raise exception 'Aturan bonus tidak ditemukan' using errcode = 'P0002';
    end if;
  end if;
  perform internal.catat_audit('simpan', 'aturan_bonus', v_id::text,
    jsonb_build_object('jenis', p_jenis, 'ambang', p_ambang, 'nominal', p_nominal, 'aktif', p_aktif));
  return v_id;
end;
$$;

-- create or replace tidak bisa menambah parameter (akan membuat overload baru), jadi fungsi lama di-drop dulu.
drop function public.simpan_material(uuid, text, text, text, boolean);

create function public.simpan_material(
  p_id uuid, p_lini_kode text, p_nama text, p_satuan text, p_aktif boolean default true,
  p_standar_bongkar numeric default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  perform internal.wajib_peran('owner', 'operasional');
  if not exists (select 1 from public.lini l where l.kode = p_lini_kode and l.aktif) then
    raise exception 'Lini % tidak ada atau tidak aktif', p_lini_kode using errcode = 'P0001';
  end if;
  if coalesce(trim(p_satuan), '') = '' then
    raise exception 'Satuan material wajib diisi' using errcode = 'P0001';
  end if;
  if p_id is null then
    insert into public.material (lini_kode, nama, satuan, aktif, standar_bongkar)
    values (p_lini_kode, trim(p_nama), trim(p_satuan), coalesce(p_aktif, true), p_standar_bongkar)
    returning id into v_id;
  else
    update public.material
       set lini_kode = p_lini_kode, nama = trim(p_nama), satuan = trim(p_satuan), aktif = coalesce(p_aktif, true),
           standar_bongkar = p_standar_bongkar
     where id = p_id returning id into v_id;
    if v_id is null then
      raise exception 'Material tidak ditemukan' using errcode = 'P0002';
    end if;
  end if;
  perform internal.catat_audit('simpan', 'material', v_id::text,
    jsonb_build_object('nama', p_nama, 'satuan', p_satuan, 'standar_bongkar', p_standar_bongkar));
  return v_id;
end;
$$;

-- Set-returning: nol baris berarti tidak ada aturan yang berlaku, sehingga pemanggil
-- lewat cross join lateral otomatis melewatkan jenis itu tanpa error.
create function public.bonus_berlaku(p_jenis text, p_tanggal date)
returns table (ambang int, nominal numeric)
language sql stable set search_path = '' as $$
  select a.ambang, a.nominal
    from public.aturan_bonus a
   where a.aktif and a.jenis = p_jenis and a.berlaku_mulai <= p_tanggal
   order by a.berlaku_mulai desc
   limit 1
$$;

select internal.terapkan_hak_akses();
-- ---------- Mesin perhitungan ----------
-- Satu sumber kebenaran: pratinjau dan posting sama-sama membaca fungsi ini.
-- Himpunan dasar: SJ selesai dengan tanggal_selesai di dalam bulan periode.
-- Aturan harian dan tonase dievaluasi pada tanggal kejadiannya; aturan bulanan pada akhir bulan.

create function internal.hitung_bonus_baris(p_periode date)
returns table (jenis text, penerima_jenis text, penerima_id uuid, penerima_nama text, dasar numeric, jumlah numeric)
language sql stable security definer set search_path = '' as $$
with batas as (
  select date_trunc('month', p_periode)::date as awal,
         (date_trunc('month', p_periode) + interval '1 month - 1 day')::date as akhir
),
sj as (
  select s.supir_id, s.pengurus_id, s.material_id, s.qty_bongkar, s.tanggal_selesai
    from public.surat_jalan s
    cross join batas b
   where s.status = 'selesai' and s.tanggal_selesai between b.awal and b.akhir
),
harian as (
  select s.supir_id as sid, s.tanggal_selesai as hari, count(*) as rit
    from sj s
   group by s.supir_id, s.tanggal_selesai
),
b_harian as (
  select 'rit_harian_supir'::text as j, 'supir'::text as pj, h.sid as pid,
         count(*)::numeric as d, sum(ab.nominal)::numeric as n
    from harian h
    cross join lateral public.bonus_berlaku('rit_harian_supir', h.hari) ab
   where h.rit >= ab.ambang
   group by h.sid
),
b_tonase as (
  select 'tonase_supir'::text as j, 'supir'::text as pj, s.supir_id as pid,
         count(*)::numeric as d, sum(ab.nominal)::numeric as n
    from sj s
    join public.material mt on mt.id = s.material_id
    cross join lateral public.bonus_berlaku('tonase_supir', s.tanggal_selesai) ab
   where mt.standar_bongkar is not null and s.qty_bongkar > mt.standar_bongkar
   group by s.supir_id
),
rit_supir as (
  select s.supir_id as sid, count(*) as rit from sj s group by s.supir_id
),
b_bulan_supir as (
  select 'rit_bulanan_supir'::text as j, 'supir'::text as pj, r.sid as pid,
         r.rit::numeric as d, ab.nominal::numeric as n
    from rit_supir r
    cross join batas b
    cross join lateral public.bonus_berlaku('rit_bulanan_supir', b.akhir) ab
   where r.rit >= ab.ambang
),
rit_pengurus as (
  select s.pengurus_id as pgid, count(*) as rit
    from sj s where s.pengurus_id is not null group by s.pengurus_id
),
b_bulan_pengurus as (
  select 'rit_bulanan_pengurus'::text as j, 'pengurus'::text as pj, r.pgid as pid,
         r.rit::numeric as d, ab.nominal::numeric as n
    from rit_pengurus r
    cross join batas b
    cross join lateral public.bonus_berlaku('rit_bulanan_pengurus', b.akhir) ab
   where r.rit >= ab.ambang
),
semua as (
  select * from b_harian
  union all select * from b_tonase
  union all select * from b_bulan_supir
  union all select * from b_bulan_pengurus
)
select t.j, t.pj, t.pid, coalesce(sp.nama, pg.nama), t.d, t.n
  from semua t
  left join public.supir sp on sp.id = t.pid and t.pj = 'supir'
  left join public.pengurus pg on pg.id = t.pid and t.pj = 'pengurus'
 where t.n > 0
 order by coalesce(sp.nama, pg.nama), t.j
$$;

create function public.pratinjau_bonus(p_periode date)
returns table (jenis text, penerima_jenis text, penerima_id uuid, penerima_nama text, dasar numeric, jumlah numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform internal.wajib_peran('owner', 'keuangan');
  if p_periode is null then
    raise exception 'Periode wajib diisi' using errcode = 'P0001';
  end if;
  return query select * from internal.hitung_bonus_baris(p_periode);
end;
$$;

select internal.terapkan_hak_akses();
