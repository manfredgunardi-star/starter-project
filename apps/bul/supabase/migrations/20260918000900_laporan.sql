-- Laporan: saldo akun, neraca, laba rugi, laba per dimensi, umur piutang, hutang upah, omzet.

create function public.laporan_saldo_akun(p_dari date, p_sampai date)
returns table (kode text, nama text, kategori text, saldo_normal text,
               saldo_awal numeric, debit numeric, kredit numeric, saldo_akhir numeric)
language sql stable set search_path = '' as $$
  with m as (
    select b.akun_kode,
           sum(case when j.tanggal < p_dari then b.debit - b.kredit else 0 end) as awal_dk,
           sum(case when j.tanggal >= p_dari then b.debit else 0 end) as d,
           sum(case when j.tanggal >= p_dari then b.kredit else 0 end) as k
      from public.jurnal_baris b
      join public.jurnal j on j.id = b.jurnal_id
     where j.tanggal <= p_sampai
     group by b.akun_kode)
  select a.kode, a.nama, public.kategori_akun(a.kode), a.saldo_normal,
         (case when a.saldo_normal = 'debit' then coalesce(m.awal_dk, 0) else -coalesce(m.awal_dk, 0) end)::numeric(18,2),
         coalesce(m.d, 0)::numeric(18,2),
         coalesce(m.k, 0)::numeric(18,2),
         (case when a.saldo_normal = 'debit'
               then coalesce(m.awal_dk, 0) + coalesce(m.d, 0) - coalesce(m.k, 0)
               else -coalesce(m.awal_dk, 0) + coalesce(m.k, 0) - coalesce(m.d, 0) end)::numeric(18,2)
    from public.akun a
    left join m on m.akun_kode = a.kode
   where a.tipe = 'detail' and (m.akun_kode is not null or a.aktif)
   order by a.kode
$$;

create function public.laporan_neraca(p_per date)
returns table (bagian text, kode text, nama text, saldo numeric)
language sql stable set search_path = '' as $$
  with s as (
    select b.akun_kode, sum(b.debit - b.kredit) as dk
      from public.jurnal_baris b join public.jurnal j on j.id = b.jurnal_id
     where j.tanggal <= p_per
     group by b.akun_kode),
  pl as (
    select coalesce(sum(case when j.tanggal >= date_trunc('year', p_per)::date then b.kredit - b.debit else 0 end), 0) as berjalan,
           coalesce(sum(case when j.tanggal < date_trunc('year', p_per)::date then b.kredit - b.debit else 0 end), 0) as lalu
      from public.jurnal_baris b join public.jurnal j on j.id = b.jurnal_id
     where j.tanggal <= p_per and left(b.akun_kode, 1) in ('4', '5', '6', '7', '8', '9'))
  select x.bagian, x.kode, x.nama, x.saldo::numeric(18,2) from (
    select case left(a.kode, 1) when '1' then 'aset' when '2' then 'kewajiban' else 'ekuitas' end as bagian,
           a.kode, a.nama,
           case when left(a.kode, 1) = '1' then s.dk else -s.dk end as saldo
      from public.akun a join s on s.akun_kode = a.kode
     where left(a.kode, 1) in ('1', '2', '3') and s.dk <> 0
    union all
    select 'ekuitas', null, 'Laba (rugi) tahun berjalan', pl.berjalan from pl
    union all
    select 'ekuitas', null, 'Laba (rugi) tahun lalu belum ditutup', pl.lalu from pl
  ) x
  where public.peran_saya() is not null
  order by case x.bagian when 'aset' then 1 when 'kewajiban' then 2 else 3 end, x.kode nulls last, x.nama
$$;

create function public.laporan_laba_rugi(p_dari date, p_sampai date)
returns table (kategori text, kode text, nama text, jumlah numeric)
language sql stable set search_path = '' as $$
  select public.kategori_akun(a.kode), a.kode, a.nama,
         sum(case when left(a.kode, 1) in ('4', '7') then b.kredit - b.debit else b.debit - b.kredit end)::numeric(18,2)
    from public.jurnal_baris b
    join public.jurnal j on j.id = b.jurnal_id
    join public.akun a on a.kode = b.akun_kode
   where j.tanggal between p_dari and p_sampai
     and (left(a.kode, 1) in ('4', '5', '6', '7', '8') or a.kode = '9110')
   group by a.kode, a.nama
  having sum(b.debit - b.kredit) <> 0
   order by a.kode
$$;

create function public.laporan_laba_dimensi(p_dari date, p_sampai date, p_dimensi text)
returns table (dimensi_id text, dimensi_nama text, pendapatan numeric, beban numeric, laba numeric)
language plpgsql stable set search_path = '' as $$
begin
  if p_dimensi is null or p_dimensi not in ('truk', 'supir', 'pelanggan', 'rute', 'lini') then
    raise exception 'Dimensi % tidak dikenal', p_dimensi using errcode = 'P0001';
  end if;
  return query
  with baris as (
    select case p_dimensi
             when 'truk' then b.truk_id::text
             when 'supir' then b.supir_id::text
             when 'pelanggan' then b.pelanggan_id::text
             when 'rute' then b.rute_id::text
             else b.lini_kode end as did,
           case when left(b.akun_kode, 1) in ('4', '7') then b.kredit - b.debit else 0 end as pdpt,
           case when left(b.akun_kode, 1) in ('5', '6', '8') or b.akun_kode = '9110' then b.debit - b.kredit else 0 end as bbn
      from public.jurnal_baris b
      join public.jurnal j on j.id = b.jurnal_id
     where j.tanggal between p_dari and p_sampai
       and (left(b.akun_kode, 1) in ('4', '5', '6', '7', '8') or b.akun_kode = '9110'))
  select x.did,
         coalesce(
           case p_dimensi
             when 'truk' then (select t.nopol from public.truk t where t.id::text = x.did)
             when 'supir' then (select s.nama from public.supir s where s.id::text = x.did)
             when 'pelanggan' then (select p.nama from public.pelanggan p where p.id::text = x.did)
             when 'rute' then (select r.nama from public.rute r where r.id::text = x.did)
             else (select l.nama from public.lini l where l.kode = x.did) end,
           '(tanpa ' || p_dimensi || ')'),
         sum(x.pdpt)::numeric(18,2), sum(x.bbn)::numeric(18,2), (sum(x.pdpt) - sum(x.bbn))::numeric(18,2)
    from baris x
   group by x.did
   order by 5 desc;
end;
$$;

create function public.laporan_umur_piutang(p_per date)
returns table (invoice_id uuid, nomor text, pelanggan_id uuid, pelanggan_nama text, tanggal date,
               jatuh_tempo date, sisa numeric, umur_hari int, kelompok text)
language sql stable set search_path = '' as $$
  select v.id, v.nomor, v.pelanggan_id, v.pelanggan_nama, v.tanggal, v.jatuh_tempo, v.sisa,
         (p_per - coalesce(v.jatuh_tempo, v.tanggal))::int,
         case
           when p_per - coalesce(v.jatuh_tempo, v.tanggal) <= 30 then '0-30'
           when p_per - coalesce(v.jatuh_tempo, v.tanggal) <= 60 then '31-60'
           when p_per - coalesce(v.jatuh_tempo, v.tanggal) <= 90 then '61-90'
           else '>90'
         end
    from public.v_invoice_saldo v
   where v.status = 'terbit' and v.sisa > 0 and v.tanggal <= p_per
   order by v.pelanggan_nama, v.tanggal
$$;

create view public.v_hutang_upah_supir with (security_invoker = true) as
select b.supir_id, s.nama as supir_nama, sum(b.kredit - b.debit)::numeric(18,2) as saldo
  from public.jurnal_baris b
  join public.pengaturan_posting pp on pp.kunci = 'hutang_upah_sopir' and pp.akun_kode = b.akun_kode
  left join public.supir s on s.id = b.supir_id
 group by b.supir_id, s.nama
having sum(b.kredit - b.debit) <> 0;

create function public.laporan_omzet(p_tahun int)
returns table (tahun int, omzet numeric, batas_omzet numeric, persen numeric, pp55_aktif boolean)
language sql stable set search_path = '' as $$
  with o as (
    select coalesce(sum(b.kredit - b.debit), 0) as omzet
      from public.jurnal_baris b
      join public.jurnal j on j.id = b.jurnal_id
      join public.pengaturan_posting pp on pp.kunci = 'pendapatan_jasa' and pp.akun_kode = b.akun_kode
     where extract(year from j.tanggal) = p_tahun)
  select p_tahun, o.omzet::numeric(18,2), pj.batas_omzet, round(o.omzet / pj.batas_omzet * 100, 2), pj.pp55_aktif
    from o
    left join lateral public.pajak_berlaku(make_date(p_tahun, 12, 31)) pj on true
   where public.peran_saya() is not null
$$;

select internal.terapkan_hak_akses();
