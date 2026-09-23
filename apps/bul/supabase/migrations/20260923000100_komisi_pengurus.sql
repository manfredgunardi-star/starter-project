-- Komisi pengurus + tipe rute: master data baru, posting saat SJ selesai (satu jurnal dengan upah).

create table public.tipe_rute (
  id uuid primary key default gen_random_uuid(),
  nama text not null unique check (length(trim(nama)) > 0),
  aktif boolean not null default true
);

create table public.pengurus (
  id uuid primary key default gen_random_uuid(),
  nama text not null check (length(trim(nama)) > 0),
  telepon text not null default '',
  aktif boolean not null default true
);

alter table public.rute add column tipe_rute_id uuid references public.tipe_rute (id);

create table public.aturan_komisi (
  id uuid primary key default gen_random_uuid(),
  nama text not null check (length(trim(nama)) > 0),
  tipe_rute_id uuid not null references public.tipe_rute (id),
  berlaku_mulai date not null,
  nominal numeric(18,2) not null check (nominal >= 0),
  aktif boolean not null default true
);
create unique index aturan_komisi_unik on public.aturan_komisi (tipe_rute_id, berlaku_mulai) where aktif;

alter table public.jurnal_baris add column pengurus_id uuid references public.pengurus (id);
alter table public.surat_jalan add column pengurus_id uuid references public.pengurus (id);

insert into public.akun (kode, nama, induk_kode, tipe, saldo_normal, kas_bank) values
  ('2125', 'Hutang Komisi Pengurus', '2120', 'detail', 'kredit', false);

alter table public.pengaturan_posting drop constraint pengaturan_posting_kunci_check;
alter table public.pengaturan_posting add constraint pengaturan_posting_kunci_check check (kunci in (
  'piutang_usaha', 'pendapatan_jasa', 'beban_uang_jalan', 'beban_upah_sopir', 'hutang_upah_sopir', 'beban_pph_final',
  'beban_komisi_pengurus', 'hutang_komisi_pengurus'));
insert into public.pengaturan_posting (kunci, akun_kode, keterangan) values
  ('beban_komisi_pengurus', '5180', 'Komisi pengurus diakui saat SJ selesai'),
  ('hutang_komisi_pengurus', '2125', 'Hutang komisi pengurus sampai dibayar');

-- ---------- RPC simpan ----------

create function public.simpan_pengurus(p_id uuid, p_nama text, p_telepon text default '', p_aktif boolean default true)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  perform internal.wajib_peran('owner', 'operasional');
  if coalesce(trim(p_nama), '') = '' then
    raise exception 'Nama pengurus wajib diisi' using errcode = 'P0001';
  end if;
  if p_id is null then
    insert into public.pengurus (nama, telepon, aktif) values (trim(p_nama), coalesce(p_telepon, ''), coalesce(p_aktif, true))
    returning id into v_id;
  else
    update public.pengurus set nama = trim(p_nama), telepon = coalesce(p_telepon, ''), aktif = coalesce(p_aktif, true)
     where id = p_id returning id into v_id;
    if v_id is null then
      raise exception 'Pengurus tidak ditemukan' using errcode = 'P0002';
    end if;
  end if;
  perform internal.catat_audit('simpan', 'pengurus', v_id::text, jsonb_build_object('nama', p_nama, 'aktif', p_aktif));
  return v_id;
end;
$$;

create function public.simpan_tipe_rute(p_id uuid, p_nama text, p_aktif boolean default true)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  perform internal.wajib_peran('owner', 'operasional');
  if coalesce(trim(p_nama), '') = '' then
    raise exception 'Nama tipe rute wajib diisi' using errcode = 'P0001';
  end if;
  if p_id is null then
    insert into public.tipe_rute (nama, aktif) values (trim(p_nama), coalesce(p_aktif, true))
    returning id into v_id;
  else
    update public.tipe_rute set nama = trim(p_nama), aktif = coalesce(p_aktif, true)
     where id = p_id returning id into v_id;
    if v_id is null then
      raise exception 'Tipe rute tidak ditemukan' using errcode = 'P0002';
    end if;
  end if;
  perform internal.catat_audit('simpan', 'tipe_rute', v_id::text, jsonb_build_object('nama', p_nama, 'aktif', p_aktif));
  return v_id;
end;
$$;

create function public.simpan_aturan_komisi(
  p_id uuid, p_nama text, p_tipe_rute_id uuid, p_berlaku_mulai date, p_nominal numeric, p_aktif boolean default true)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  perform internal.wajib_peran('owner', 'keuangan');
  if p_tipe_rute_id is null then
    raise exception 'Tipe rute wajib diisi' using errcode = 'P0001';
  end if;
  if p_id is null then
    insert into public.aturan_komisi (nama, tipe_rute_id, berlaku_mulai, nominal, aktif)
    values (trim(p_nama), p_tipe_rute_id, p_berlaku_mulai, p_nominal, coalesce(p_aktif, true))
    returning id into v_id;
  else
    update public.aturan_komisi
       set nama = trim(p_nama), tipe_rute_id = p_tipe_rute_id, berlaku_mulai = p_berlaku_mulai,
           nominal = p_nominal, aktif = coalesce(p_aktif, true)
     where id = p_id returning id into v_id;
    if v_id is null then
      raise exception 'Aturan komisi tidak ditemukan' using errcode = 'P0002';
    end if;
  end if;
  perform internal.catat_audit('simpan', 'aturan_komisi', v_id::text,
    jsonb_build_object('nama', p_nama, 'nominal', p_nominal, 'aktif', p_aktif));
  return v_id;
end;
$$;

-- p_tipe_rute_id adalah parameter baru (ke-6) pada public.simpan_rute — CREATE OR REPLACE tidak bisa
-- dipakai untuk menambah parameter (akan membuat overload baru, bukan mengganti fungsi lama), jadi
-- fungsi lama harus di-drop eksplisit dulu.
drop function public.simpan_rute(uuid, text, text, text, boolean);

create function public.simpan_rute(
  p_id uuid, p_nama text, p_asal text default '', p_tujuan text default '', p_aktif boolean default true,
  p_tipe_rute_id uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  perform internal.wajib_peran('owner', 'operasional');
  if coalesce(trim(p_nama), '') = '' then
    raise exception 'Nama rute wajib diisi' using errcode = 'P0001';
  end if;
  if p_id is null then
    insert into public.rute (nama, asal, tujuan, aktif, tipe_rute_id)
    values (trim(p_nama), coalesce(p_asal, ''), coalesce(p_tujuan, ''), coalesce(p_aktif, true), p_tipe_rute_id)
    returning id into v_id;
  else
    update public.rute
       set nama = trim(p_nama), asal = coalesce(p_asal, ''), tujuan = coalesce(p_tujuan, ''), aktif = coalesce(p_aktif, true),
           tipe_rute_id = p_tipe_rute_id
     where id = p_id returning id into v_id;
    if v_id is null then
      raise exception 'Rute tidak ditemukan' using errcode = 'P0002';
    end if;
  end if;
  perform internal.catat_audit('simpan', 'rute', v_id::text, jsonb_build_object('nama', p_nama, 'aktif', p_aktif));
  return v_id;
end;
$$;

create function public.komisi_berlaku(p_tipe_rute_id uuid, p_tanggal date) returns numeric
language sql stable set search_path = '' as $$
  select a.nominal
  from public.aturan_komisi a
  where a.aktif and a.tipe_rute_id = p_tipe_rute_id and a.berlaku_mulai <= p_tanggal
  order by a.berlaku_mulai desc
  limit 1
$$;

-- ---------- Posting: pengurus_id sebagai dimensi baru ----------

create or replace function internal.posting_jurnal(
  p_tanggal date, p_keterangan text, p_sumber_tipe text, p_sumber_id uuid, p_baris jsonb,
  p_membalik_id uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_kunci date;
  v_b jsonb;
  v_i int := 0;
  v_d numeric := 0;
  v_k numeric := 0;
  v_debit numeric;
  v_kredit numeric;
  v_akun public.akun;
begin
  if p_tanggal is null then
    raise exception 'Tanggal jurnal wajib diisi' using errcode = 'P0001';
  end if;
  select terkunci_sampai into v_kunci from public.kunci_periode where id;
  if v_kunci is not null and p_tanggal <= v_kunci then
    raise exception 'Periode sampai % sudah dikunci', v_kunci using errcode = 'P0001';
  end if;
  if p_baris is null or jsonb_typeof(p_baris) <> 'array' then
    raise exception 'Baris jurnal harus berupa daftar' using errcode = 'P0001';
  end if;

  insert into public.jurnal (nomor, tanggal, keterangan, sumber_tipe, sumber_id, membalik_id, dibuat_oleh)
  values (
    'JU-' || to_char(p_tanggal, 'YYYY') || '-'
      || lpad(internal.nomor_berikut('jurnal-' || to_char(p_tanggal, 'YYYY'))::text, 6, '0'),
    p_tanggal, p_keterangan, p_sumber_tipe, p_sumber_id, p_membalik_id, auth.uid())
  returning id into v_id;

  for v_b in select value from jsonb_array_elements(p_baris) loop
    v_debit := coalesce(nullif(v_b ->> 'debit', '')::numeric, 0);
    v_kredit := coalesce(nullif(v_b ->> 'kredit', '')::numeric, 0);
    continue when v_debit = 0 and v_kredit = 0;
    if v_debit <> round(v_debit, 2) or v_kredit <> round(v_kredit, 2) then
      raise exception 'Nilai jurnal maksimal 2 desimal' using errcode = 'P0001';
    end if;
    select * into v_akun from public.akun where kode = v_b ->> 'akun_kode';
    if not found then
      raise exception 'Akun % tidak ada', v_b ->> 'akun_kode' using errcode = 'P0001';
    end if;
    if v_akun.tipe <> 'detail' or (not v_akun.aktif and p_membalik_id is null) then
      raise exception 'Akun % bukan akun detail aktif', v_akun.kode using errcode = 'P0001';
    end if;
    v_i := v_i + 1;
    insert into public.jurnal_baris (
      jurnal_id, urutan, akun_kode, debit, kredit, keterangan,
      lini_kode, truk_id, supir_id, pelanggan_id, rute_id, pengurus_id)
    values (
      v_id, v_i, v_akun.kode, v_debit, v_kredit,
      coalesce(nullif(trim(v_b ->> 'keterangan'), ''), p_keterangan),
      nullif(v_b ->> 'lini_kode', ''),
      nullif(v_b ->> 'truk_id', '')::uuid,
      nullif(v_b ->> 'supir_id', '')::uuid,
      nullif(v_b ->> 'pelanggan_id', '')::uuid,
      nullif(v_b ->> 'rute_id', '')::uuid,
      nullif(v_b ->> 'pengurus_id', '')::uuid);
    v_d := v_d + v_debit;
    v_k := v_k + v_kredit;
  end loop;

  if v_i < 2 then
    raise exception 'Jurnal minimal dua baris bernilai' using errcode = 'P0001';
  end if;
  if v_d <> v_k then
    raise exception 'Jurnal tidak seimbang: debit % kredit %', v_d, v_k using errcode = '23514';
  end if;
  return v_id;
end;
$$;

create or replace function internal.balik_jurnal(p_jurnal_id uuid, p_tanggal date, p_alasan text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_asal public.jurnal;
  v_baris jsonb;
  v_id uuid;
begin
  if coalesce(trim(p_alasan), '') = '' then
    raise exception 'Alasan pembatalan wajib diisi' using errcode = 'P0001';
  end if;
  select * into v_asal from public.jurnal where id = p_jurnal_id for update;
  if not found then
    raise exception 'Jurnal tidak ditemukan' using errcode = 'P0002';
  end if;
  if v_asal.dibalik_oleh_id is not null then
    raise exception 'Jurnal % sudah dibatalkan', v_asal.nomor using errcode = 'P0001';
  end if;
  if v_asal.sumber_tipe = 'pembalik' then
    raise exception 'Jurnal pembalik tidak dapat dibatalkan' using errcode = 'P0001';
  end if;
  if p_tanggal is null or p_tanggal < v_asal.tanggal then
    raise exception 'Tanggal pembatalan tidak boleh sebelum %', v_asal.tanggal using errcode = 'P0001';
  end if;
  select jsonb_agg(jsonb_build_object(
           'akun_kode', b.akun_kode, 'debit', b.kredit, 'kredit', b.debit,
           'keterangan', 'Pembalik: ' || b.keterangan,
           'lini_kode', b.lini_kode, 'truk_id', b.truk_id, 'supir_id', b.supir_id,
           'pelanggan_id', b.pelanggan_id, 'rute_id', b.rute_id, 'pengurus_id', b.pengurus_id) order by b.urutan)
    into v_baris
    from public.jurnal_baris b where b.jurnal_id = p_jurnal_id;
  v_id := internal.posting_jurnal(
    p_tanggal, 'Pembalik ' || v_asal.nomor || ': ' || trim(p_alasan), 'pembalik', v_asal.sumber_id, v_baris, p_jurnal_id);
  update public.jurnal set dibalik_oleh_id = v_id where id = p_jurnal_id;
  return v_id;
end;
$$;

create or replace function public.buat_sj(
  p_lini_kode text, p_nomor text, p_tanggal date, p_pelanggan_id uuid, p_rute_id uuid, p_material_id uuid,
  p_truk_id uuid, p_supir_id uuid, p_qty_muat numeric, p_uang_jalan numeric default null, p_keterangan text default '')
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid;
  v_id uuid;
  v_uj numeric;
  v_pengurus_id uuid;
  v_jumlah_pengurus int;
begin
  v_uid := internal.wajib_peran('owner', 'operasional');
  if coalesce(trim(p_nomor), '') = '' then
    raise exception 'Nomor SJ wajib diisi' using errcode = 'P0001';
  end if;
  if p_tanggal is null then
    raise exception 'Tanggal SJ wajib diisi' using errcode = 'P0001';
  end if;
  perform internal.validasi_master_sj(p_lini_kode, p_pelanggan_id, p_rute_id, p_material_id, p_truk_id, p_supir_id);
  v_uj := coalesce(p_uang_jalan, public.uang_jalan_berlaku(p_rute_id, p_tanggal));
  if v_uj is null then
    raise exception 'Uang jalan rute belum diatur untuk tanggal %', p_tanggal using errcode = 'P0001';
  end if;
  select count(*), min(id::text)::uuid into v_jumlah_pengurus, v_pengurus_id from public.pengurus where aktif;
  if v_jumlah_pengurus <> 1 then
    v_pengurus_id := null;
  end if;
  insert into public.surat_jalan (
    lini_kode, nomor, tanggal, pelanggan_id, rute_id, material_id, truk_id, supir_id,
    qty_muat, uang_jalan, keterangan, dibuat_oleh, pengurus_id)
  values (
    p_lini_kode, trim(p_nomor), p_tanggal, p_pelanggan_id, p_rute_id, p_material_id, p_truk_id, p_supir_id,
    p_qty_muat, v_uj, coalesce(p_keterangan, ''), v_uid, v_pengurus_id)
  returning id into v_id;
  perform internal.catat_audit('buat', 'surat_jalan', v_id::text,
    jsonb_build_object('lini', p_lini_kode, 'nomor', trim(p_nomor)));
  return v_id;
end;
$$;

create or replace function public.selesaikan_sj(p_id uuid, p_qty_bongkar numeric, p_tanggal_selesai date, p_upah numeric default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid;
  v_sj public.surat_jalan;
  v_upah numeric;
  v_tipe_rute_id uuid;
  v_komisi numeric;
  v_jurnal uuid;
  v_dim jsonb;
  v_baris jsonb := '[]'::jsonb;
begin
  v_uid := internal.wajib_peran('owner', 'operasional');
  select * into v_sj from public.surat_jalan where id = p_id for update;
  if not found then
    raise exception 'Surat jalan tidak ditemukan' using errcode = 'P0002';
  end if;
  if v_sj.status <> 'berangkat' then
    raise exception 'SJ % berstatus %, tidak bisa diselesaikan', v_sj.nomor, v_sj.status using errcode = 'P0001';
  end if;
  if p_qty_bongkar is null or p_qty_bongkar <= 0 then
    raise exception 'Qty bongkar harus lebih dari 0' using errcode = 'P0001';
  end if;
  if p_tanggal_selesai is null or p_tanggal_selesai < v_sj.tanggal then
    raise exception 'Tanggal selesai tidak boleh sebelum tanggal SJ (%)', v_sj.tanggal using errcode = 'P0001';
  end if;
  v_upah := coalesce(p_upah, public.upah_berlaku(v_sj.rute_id, v_sj.material_id, v_sj.tanggal, p_qty_bongkar));
  if v_upah is null then
    raise exception 'Tidak ada aturan upah yang berlaku untuk SJ %; isi upah manual', v_sj.nomor using errcode = 'P0001';
  end if;
  if v_upah < 0 then
    raise exception 'Upah tidak boleh negatif' using errcode = 'P0001';
  end if;
  v_dim := jsonb_build_object(
    'lini_kode', v_sj.lini_kode, 'truk_id', v_sj.truk_id, 'supir_id', v_sj.supir_id,
    'pelanggan_id', v_sj.pelanggan_id, 'rute_id', v_sj.rute_id);
  if v_upah > 0 then
    v_baris := v_baris || jsonb_build_array(
      v_dim || jsonb_build_object('akun_kode', internal.akun_posting('beban_upah_sopir'), 'debit', v_upah),
      v_dim || jsonb_build_object('akun_kode', internal.akun_posting('hutang_upah_sopir'), 'kredit', v_upah));
  end if;
  select tipe_rute_id into v_tipe_rute_id from public.rute where id = v_sj.rute_id;
  v_komisi := public.komisi_berlaku(v_tipe_rute_id, v_sj.tanggal);
  if v_komisi is not null and v_komisi > 0 then
    v_baris := v_baris || jsonb_build_array(
      (v_dim || jsonb_build_object('pengurus_id', v_sj.pengurus_id))
        || jsonb_build_object('akun_kode', internal.akun_posting('beban_komisi_pengurus'), 'debit', v_komisi),
      (v_dim || jsonb_build_object('pengurus_id', v_sj.pengurus_id))
        || jsonb_build_object('akun_kode', internal.akun_posting('hutang_komisi_pengurus'), 'kredit', v_komisi));
  end if;
  if jsonb_array_length(v_baris) > 0 then
    v_jurnal := internal.posting_jurnal(
      p_tanggal_selesai, 'SJ selesai ' || v_sj.lini_kode || ' ' || v_sj.nomor, 'sj_selesai', v_sj.id, v_baris);
  end if;
  update public.surat_jalan
     set status = 'selesai', qty_bongkar = p_qty_bongkar, tanggal_selesai = p_tanggal_selesai, upah = v_upah,
         jurnal_upah_id = v_jurnal, diubah_oleh = v_uid, diubah_pada = now()
   where id = p_id;
  perform internal.catat_audit('selesai', 'surat_jalan', p_id::text,
    jsonb_build_object('qty_bongkar', p_qty_bongkar, 'upah', v_upah, 'komisi', v_komisi));
  return p_id;
end;
$$;

-- ---------- Laporan ----------

create view public.v_hutang_komisi_pengurus with (security_invoker = true) as
select b.pengurus_id, p.nama as pengurus_nama, sum(b.kredit - b.debit)::numeric(18,2) as saldo
  from public.jurnal_baris b
  join public.pengaturan_posting pp on pp.kunci = 'hutang_komisi_pengurus' and pp.akun_kode = b.akun_kode
  left join public.pengurus p on p.id = b.pengurus_id
 group by b.pengurus_id, p.nama
having sum(b.kredit - b.debit) <> 0;

select internal.terapkan_hak_akses();
