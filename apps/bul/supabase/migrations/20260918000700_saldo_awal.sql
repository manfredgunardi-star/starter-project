-- Saldo awal: satu jurnal saldo_awal aktif + rincian piutang lama per invoice.

create unique index jurnal_saldo_awal_tunggal on public.jurnal ((true))
  where sumber_tipe = 'saldo_awal' and dibalik_oleh_id is null;

create function public.posting_saldo_awal(p_tanggal date, p_baris jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  perform internal.wajib_peran('owner');
  if exists (select 1 from public.jurnal where sumber_tipe = 'saldo_awal' and dibalik_oleh_id is null) then
    raise exception 'Saldo awal sudah diposting; batalkan dulu sebelum memposting ulang' using errcode = 'P0001';
  end if;
  v_id := internal.posting_jurnal(p_tanggal, 'Saldo awal per ' || to_char(p_tanggal, 'DD-MM-YYYY'), 'saldo_awal', null, p_baris);
  perform internal.catat_audit('posting', 'saldo_awal', v_id::text, jsonb_build_object('tanggal', p_tanggal));
  return v_id;
end;
$$;

create function public.batalkan_saldo_awal(p_alasan text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_j public.jurnal;
  v_id uuid;
begin
  perform internal.wajib_peran('owner');
  select * into v_j from public.jurnal where sumber_tipe = 'saldo_awal' and dibalik_oleh_id is null;
  if not found then
    raise exception 'Belum ada saldo awal aktif' using errcode = 'P0002';
  end if;
  v_id := internal.balik_jurnal(v_j.id, v_j.tanggal, p_alasan);
  perform internal.catat_audit('batal', 'saldo_awal', v_j.id::text, jsonb_build_object('alasan', p_alasan));
  return v_id;
end;
$$;

create function public.buat_piutang_saldo_awal(
  p_nomor text, p_lini_kode text, p_pelanggan_id uuid, p_tanggal date, p_jumlah numeric, p_keterangan text default '')
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid;
  v_tgl_sa date;
  v_id uuid;
begin
  v_uid := internal.wajib_peran('owner');
  select tanggal into v_tgl_sa from public.jurnal where sumber_tipe = 'saldo_awal' and dibalik_oleh_id is null;
  if v_tgl_sa is null then
    raise exception 'Posting saldo awal dulu sebelum mencatat piutang lama' using errcode = 'P0001';
  end if;
  if p_tanggal is null or p_tanggal > v_tgl_sa then
    raise exception 'Tanggal piutang lama harus paling lambat %', v_tgl_sa using errcode = 'P0001';
  end if;
  if coalesce(trim(p_nomor), '') = '' then
    raise exception 'Nomor invoice lama wajib diisi' using errcode = 'P0001';
  end if;
  if p_jumlah is null or p_jumlah <= 0 then
    raise exception 'Jumlah piutang harus lebih dari 0' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.invoice where nomor = trim(p_nomor) and status = 'terbit') then
    raise exception 'Nomor invoice % sudah dipakai', trim(p_nomor) using errcode = '23505';
  end if;
  insert into public.invoice (
    nomor, lini_kode, pelanggan_id, tanggal, subtotal, total_uang_jalan, total_akhir, saldo_awal, keterangan, dibuat_oleh)
  values (trim(p_nomor), p_lini_kode, p_pelanggan_id, p_tanggal, p_jumlah, 0, p_jumlah, true, coalesce(p_keterangan, ''), v_uid)
  returning id into v_id;
  perform internal.catat_audit('buat', 'invoice_saldo_awal', v_id::text,
    jsonb_build_object('nomor', trim(p_nomor), 'jumlah', p_jumlah));
  return v_id;
end;
$$;

create function public.cek_saldo_awal_piutang()
returns table (saldo_gl numeric, total_invoice numeric, selisih numeric)
language sql stable set search_path = '' as $$
  with gl as (
    select coalesce(sum(b.debit - b.kredit), 0) as v
      from public.jurnal_baris b
      join public.jurnal j on j.id = b.jurnal_id
      join public.pengaturan_posting pp on pp.kunci = 'piutang_usaha' and pp.akun_kode = b.akun_kode
     where j.sumber_tipe = 'saldo_awal' and j.dibalik_oleh_id is null),
  inv as (
    select coalesce(sum(total_akhir), 0) as v from public.invoice where saldo_awal and status = 'terbit')
  select gl.v::numeric(18,2), inv.v::numeric(18,2), (gl.v - inv.v)::numeric(18,2) from gl, inv
$$;

select internal.terapkan_hak_akses();
