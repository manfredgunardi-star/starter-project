-- Surat jalan: buat, ubah, selesaikan (posting upah), batalkan (jurnal pembalik).

create table public.surat_jalan (
  id uuid primary key default gen_random_uuid(),
  lini_kode text not null references public.lini (kode),
  nomor text not null check (length(trim(nomor)) > 0),
  tanggal date not null,
  pelanggan_id uuid not null references public.pelanggan (id),
  rute_id uuid not null references public.rute (id),
  material_id uuid not null references public.material (id),
  truk_id uuid not null references public.truk (id),
  supir_id uuid not null references public.supir (id),
  qty_muat numeric(12,3) not null check (qty_muat > 0),
  qty_bongkar numeric(12,3) check (qty_bongkar > 0),
  uang_jalan numeric(18,2) not null check (uang_jalan >= 0),
  upah numeric(18,2) check (upah >= 0),
  status text not null default 'berangkat' check (status in ('berangkat', 'selesai', 'batal')),
  tanggal_selesai date,
  invoice_id uuid,
  jurnal_upah_id uuid references public.jurnal (id),
  keterangan text not null default '',
  alasan_batal text,
  dibuat_oleh uuid,
  dibuat_pada timestamptz not null default now(),
  diubah_oleh uuid,
  diubah_pada timestamptz,
  check (status <> 'selesai' or (qty_bongkar is not null and tanggal_selesai is not null and upah is not null)),
  check (tanggal_selesai is null or tanggal_selesai >= tanggal)
);
create unique index surat_jalan_nomor_unik on public.surat_jalan (lini_kode, nomor) where status <> 'batal';
create index surat_jalan_tanggal_idx on public.surat_jalan (tanggal);
create index surat_jalan_belum_invoice_idx on public.surat_jalan (lini_kode, pelanggan_id) where status = 'selesai' and invoice_id is null;

create function internal.validasi_master_sj(
  p_lini_kode text, p_pelanggan_id uuid, p_rute_id uuid, p_material_id uuid, p_truk_id uuid, p_supir_id uuid)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.lini where kode = p_lini_kode and aktif) then
    raise exception 'Lini % tidak aktif', p_lini_kode using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.pelanggan where id = p_pelanggan_id and aktif) then
    raise exception 'Pelanggan tidak aktif atau tidak ada' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.rute where id = p_rute_id and aktif) then
    raise exception 'Rute tidak aktif atau tidak ada' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.material where id = p_material_id and aktif and lini_kode = p_lini_kode) then
    raise exception 'Material tidak aktif atau bukan milik lini %', p_lini_kode using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.truk where id = p_truk_id and aktif) then
    raise exception 'Truk tidak aktif atau tidak ada' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.supir where id = p_supir_id and aktif) then
    raise exception 'Supir tidak aktif atau tidak ada' using errcode = 'P0001';
  end if;
end;
$$;

create function public.buat_sj(
  p_lini_kode text, p_nomor text, p_tanggal date, p_pelanggan_id uuid, p_rute_id uuid, p_material_id uuid,
  p_truk_id uuid, p_supir_id uuid, p_qty_muat numeric, p_uang_jalan numeric default null, p_keterangan text default '')
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid;
  v_id uuid;
  v_uj numeric;
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
  insert into public.surat_jalan (
    lini_kode, nomor, tanggal, pelanggan_id, rute_id, material_id, truk_id, supir_id,
    qty_muat, uang_jalan, keterangan, dibuat_oleh)
  values (
    p_lini_kode, trim(p_nomor), p_tanggal, p_pelanggan_id, p_rute_id, p_material_id, p_truk_id, p_supir_id,
    p_qty_muat, v_uj, coalesce(p_keterangan, ''), v_uid)
  returning id into v_id;
  perform internal.catat_audit('buat', 'surat_jalan', v_id::text,
    jsonb_build_object('lini', p_lini_kode, 'nomor', trim(p_nomor)));
  return v_id;
end;
$$;

create function public.ubah_sj(
  p_id uuid, p_nomor text, p_tanggal date, p_pelanggan_id uuid, p_rute_id uuid, p_material_id uuid,
  p_truk_id uuid, p_supir_id uuid, p_qty_muat numeric, p_uang_jalan numeric, p_keterangan text default '')
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid;
  v_sj public.surat_jalan;
begin
  v_uid := internal.wajib_peran('owner', 'operasional');
  select * into v_sj from public.surat_jalan where id = p_id for update;
  if not found then
    raise exception 'Surat jalan tidak ditemukan' using errcode = 'P0002';
  end if;
  if v_sj.status <> 'berangkat' then
    raise exception 'SJ % berstatus %, tidak bisa diubah; batalkan lalu buat ulang', v_sj.nomor, v_sj.status
      using errcode = 'P0001';
  end if;
  if coalesce(trim(p_nomor), '') = '' or p_tanggal is null or p_uang_jalan is null then
    raise exception 'Nomor, tanggal, dan uang jalan wajib diisi' using errcode = 'P0001';
  end if;
  perform internal.validasi_master_sj(v_sj.lini_kode, p_pelanggan_id, p_rute_id, p_material_id, p_truk_id, p_supir_id);
  update public.surat_jalan
     set nomor = trim(p_nomor), tanggal = p_tanggal, pelanggan_id = p_pelanggan_id, rute_id = p_rute_id,
         material_id = p_material_id, truk_id = p_truk_id, supir_id = p_supir_id, qty_muat = p_qty_muat,
         uang_jalan = p_uang_jalan, keterangan = coalesce(p_keterangan, ''), diubah_oleh = v_uid, diubah_pada = now()
   where id = p_id;
  perform internal.catat_audit('ubah', 'surat_jalan', p_id::text, jsonb_build_object('nomor', trim(p_nomor)));
  return p_id;
end;
$$;

create function public.selesaikan_sj(p_id uuid, p_qty_bongkar numeric, p_tanggal_selesai date, p_upah numeric default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid;
  v_sj public.surat_jalan;
  v_upah numeric;
  v_jurnal uuid;
  v_dim jsonb;
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
  if v_upah > 0 then
    v_dim := jsonb_build_object(
      'lini_kode', v_sj.lini_kode, 'truk_id', v_sj.truk_id, 'supir_id', v_sj.supir_id,
      'pelanggan_id', v_sj.pelanggan_id, 'rute_id', v_sj.rute_id);
    v_jurnal := internal.posting_jurnal(
      p_tanggal_selesai, 'Upah SJ ' || v_sj.lini_kode || ' ' || v_sj.nomor, 'sj_selesai', v_sj.id,
      jsonb_build_array(
        v_dim || jsonb_build_object('akun_kode', internal.akun_posting('beban_upah_sopir'), 'debit', v_upah),
        v_dim || jsonb_build_object('akun_kode', internal.akun_posting('hutang_upah_sopir'), 'kredit', v_upah)));
  end if;
  update public.surat_jalan
     set status = 'selesai', qty_bongkar = p_qty_bongkar, tanggal_selesai = p_tanggal_selesai, upah = v_upah,
         jurnal_upah_id = v_jurnal, diubah_oleh = v_uid, diubah_pada = now()
   where id = p_id;
  perform internal.catat_audit('selesai', 'surat_jalan', p_id::text,
    jsonb_build_object('qty_bongkar', p_qty_bongkar, 'upah', v_upah));
  return p_id;
end;
$$;

create function public.batalkan_sj(p_id uuid, p_alasan text, p_tanggal date default current_date)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid;
  v_sj public.surat_jalan;
begin
  v_uid := internal.wajib_peran('owner', 'operasional');
  select * into v_sj from public.surat_jalan where id = p_id for update;
  if not found then
    raise exception 'Surat jalan tidak ditemukan' using errcode = 'P0002';
  end if;
  if v_sj.status = 'batal' then
    raise exception 'SJ % sudah batal', v_sj.nomor using errcode = 'P0001';
  end if;
  if v_sj.invoice_id is not null then
    raise exception 'SJ % sudah masuk invoice; batalkan invoice dulu', v_sj.nomor using errcode = 'P0001';
  end if;
  if coalesce(trim(p_alasan), '') = '' then
    raise exception 'Alasan pembatalan wajib diisi' using errcode = 'P0001';
  end if;
  if v_sj.jurnal_upah_id is not null then
    perform internal.balik_jurnal(v_sj.jurnal_upah_id, p_tanggal, 'Batal SJ ' || v_sj.nomor || ': ' || trim(p_alasan));
  end if;
  update public.surat_jalan
     set status = 'batal', alasan_batal = trim(p_alasan), diubah_oleh = v_uid, diubah_pada = now()
   where id = p_id;
  perform internal.catat_audit('batal', 'surat_jalan', p_id::text, jsonb_build_object('alasan', p_alasan));
  return p_id;
end;
$$;

select internal.terapkan_hak_akses();
