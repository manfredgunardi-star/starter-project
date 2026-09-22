-- Invoice: pratinjau, terbitkan (posting pendapatan bruto, beban UJ, piutang bersih), batalkan.

create table public.invoice (
  id uuid primary key default gen_random_uuid(),
  nomor text not null check (length(trim(nomor)) > 0),
  lini_kode text not null references public.lini (kode),
  pelanggan_id uuid not null references public.pelanggan (id),
  tanggal date not null,
  jatuh_tempo date,
  subtotal numeric(18,2) not null check (subtotal >= 0),
  total_uang_jalan numeric(18,2) not null check (total_uang_jalan >= 0),
  total_akhir numeric(18,2) not null check (total_akhir >= 0),
  saldo_awal boolean not null default false,
  status text not null default 'terbit' check (status in ('terbit', 'batal')),
  jurnal_id uuid references public.jurnal (id),
  jurnal_batal_id uuid references public.jurnal (id),
  keterangan text not null default '',
  alasan_batal text,
  dibuat_oleh uuid,
  dibuat_pada timestamptz not null default now(),
  check (total_akhir = subtotal - total_uang_jalan),
  check (saldo_awal or jurnal_id is not null)
);
create unique index invoice_nomor_unik on public.invoice (nomor) where status = 'terbit';
create index invoice_pelanggan_idx on public.invoice (pelanggan_id, tanggal);

create table public.invoice_baris (
  id bigint generated always as identity primary key,
  invoice_id uuid not null references public.invoice (id),
  surat_jalan_id uuid not null references public.surat_jalan (id),
  qty numeric(12,3) not null,
  harga_satuan numeric(18,2) not null,
  jumlah numeric(18,2) not null,
  uang_jalan numeric(18,2) not null,
  aktif boolean not null default true
);
create unique index invoice_baris_sj_aktif on public.invoice_baris (surat_jalan_id) where aktif;

alter table public.surat_jalan
  add constraint surat_jalan_invoice_fk foreign key (invoice_id) references public.invoice (id);

-- Diganti di migrasi pembayaran.
create function internal.total_alokasi_invoice(p_invoice_id uuid) returns numeric
language sql stable security definer set search_path = '' as $$
  select 0::numeric
$$;

create function internal.hitung_baris_invoice(p_lini_kode text, p_pelanggan_id uuid, p_sj_ids uuid[])
returns table (
  surat_jalan_id uuid, nomor text, tanggal date, rute_id uuid, material_id uuid, truk_id uuid, supir_id uuid,
  qty numeric, harga_satuan numeric, jumlah numeric, uang_jalan numeric, masalah text)
language sql stable security definer set search_path = '' as $$
  with ids as (select distinct unnest(p_sj_ids) as id)
  select ids.id, sj.nomor, sj.tanggal, sj.rute_id, sj.material_id, sj.truk_id, sj.supir_id,
         sj.qty_bongkar, t.harga, round(sj.qty_bongkar * t.harga, 2), sj.uang_jalan,
         case
           when sj.id is null then 'SJ tidak ditemukan'
           when sj.status <> 'selesai' then 'SJ ' || sj.nomor || ' berstatus ' || sj.status
           when sj.invoice_id is not null then 'SJ ' || sj.nomor || ' sudah masuk invoice lain'
           when sj.lini_kode <> p_lini_kode then 'SJ ' || sj.nomor || ' bukan lini ' || p_lini_kode
           when sj.pelanggan_id <> p_pelanggan_id then 'SJ ' || sj.nomor || ' milik pelanggan lain'
           when t.harga is null then 'Tarif belum ada untuk SJ ' || sj.nomor || ' (tanggal ' || sj.tanggal || ')'
         end
    from ids
    left join public.surat_jalan sj on sj.id = ids.id
    left join lateral (
      select public.tarif_berlaku(sj.pelanggan_id, sj.rute_id, sj.material_id, sj.tanggal) as harga
    ) t on true
   order by sj.tanggal, sj.nomor
$$;

create function public.pratinjau_invoice(p_lini_kode text, p_pelanggan_id uuid, p_sj_ids uuid[])
returns table (
  surat_jalan_id uuid, nomor text, tanggal date, rute_id uuid, material_id uuid, truk_id uuid, supir_id uuid,
  qty numeric, harga_satuan numeric, jumlah numeric, uang_jalan numeric, masalah text)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform internal.wajib_peran('owner', 'keuangan', 'operasional', 'viewer');
  return query select * from internal.hitung_baris_invoice(p_lini_kode, p_pelanggan_id, p_sj_ids);
end;
$$;

create function public.terbitkan_invoice(
  p_lini_kode text, p_pelanggan_id uuid, p_tanggal date, p_sj_ids uuid[],
  p_nomor text default null, p_jatuh_tempo date default null, p_keterangan text default '')
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid;
  v_id uuid := gen_random_uuid();
  v_nomor text;
  v_masalah text;
  v_subtotal numeric;
  v_uj numeric;
  v_total numeric;
  v_max_tgl date;
  v_baris jsonb;
  v_dim jsonb;
  v_jurnal uuid;
  v_piutang text;
  v_pendapatan text;
  v_beban_uj text;
  r record;
begin
  v_uid := internal.wajib_peran('owner', 'keuangan');
  if p_sj_ids is null or cardinality(p_sj_ids) = 0 then
    raise exception 'Pilih minimal satu SJ' using errcode = 'P0001';
  end if;
  if p_tanggal is null then
    raise exception 'Tanggal invoice wajib diisi' using errcode = 'P0001';
  end if;

  -- Kunci SJ agar dua penerbitan bersamaan tidak memakai SJ yang sama.
  perform 1 from public.surat_jalan where id = any (p_sj_ids) order by id for update;

  select string_agg(h.masalah, '; ') into v_masalah
    from internal.hitung_baris_invoice(p_lini_kode, p_pelanggan_id, p_sj_ids) h
   where h.masalah is not null;
  if v_masalah is not null then
    raise exception '%', v_masalah using errcode = 'P0001';
  end if;

  select coalesce(sum(h.jumlah), 0), coalesce(sum(h.uang_jalan), 0), max(h.tanggal)
    into v_subtotal, v_uj, v_max_tgl
    from internal.hitung_baris_invoice(p_lini_kode, p_pelanggan_id, p_sj_ids) h;
  v_total := v_subtotal - v_uj;
  if v_total < 0 then
    raise exception 'Total uang jalan (%) melebihi subtotal (%)', v_uj, v_subtotal using errcode = 'P0001';
  end if;
  if p_tanggal < v_max_tgl then
    raise exception 'Tanggal invoice tidak boleh sebelum tanggal SJ terakhir (%)', v_max_tgl using errcode = 'P0001';
  end if;

  if coalesce(trim(p_nomor), '') = '' then
    v_nomor := p_lini_kode || '/'
      || lpad(internal.nomor_berikut('invoice-' || p_lini_kode || '-' || to_char(p_tanggal, 'YYYY'))::text, 3, '0')
      || '/' || to_char(p_tanggal, 'MM') || '/' || to_char(p_tanggal, 'YYYY');
  else
    v_nomor := trim(p_nomor);
  end if;
  if exists (select 1 from public.invoice where nomor = v_nomor and status = 'terbit') then
    raise exception 'Nomor invoice % sudah dipakai', v_nomor using errcode = '23505';
  end if;

  v_piutang := internal.akun_posting('piutang_usaha');
  v_pendapatan := internal.akun_posting('pendapatan_jasa');
  v_beban_uj := internal.akun_posting('beban_uang_jalan');

  v_baris := jsonb_build_array(jsonb_build_object(
    'akun_kode', v_piutang, 'debit', v_total, 'lini_kode', p_lini_kode, 'pelanggan_id', p_pelanggan_id,
    'keterangan', 'Piutang invoice ' || v_nomor));
  for r in select * from internal.hitung_baris_invoice(p_lini_kode, p_pelanggan_id, p_sj_ids) loop
    v_dim := jsonb_build_object(
      'lini_kode', p_lini_kode, 'pelanggan_id', p_pelanggan_id, 'rute_id', r.rute_id,
      'truk_id', r.truk_id, 'supir_id', r.supir_id);
    v_baris := v_baris || jsonb_build_array(
      v_dim || jsonb_build_object('akun_kode', v_beban_uj, 'debit', r.uang_jalan, 'keterangan', 'Uang jalan SJ ' || r.nomor),
      v_dim || jsonb_build_object('akun_kode', v_pendapatan, 'kredit', r.jumlah, 'keterangan', 'Pendapatan SJ ' || r.nomor));
  end loop;

  v_jurnal := internal.posting_jurnal(p_tanggal, 'Invoice ' || v_nomor, 'invoice', v_id, v_baris);

  insert into public.invoice (
    id, nomor, lini_kode, pelanggan_id, tanggal, jatuh_tempo, subtotal, total_uang_jalan, total_akhir,
    jurnal_id, keterangan, dibuat_oleh)
  values (
    v_id, v_nomor, p_lini_kode, p_pelanggan_id, p_tanggal, p_jatuh_tempo, v_subtotal, v_uj, v_total,
    v_jurnal, coalesce(p_keterangan, ''), v_uid);

  insert into public.invoice_baris (invoice_id, surat_jalan_id, qty, harga_satuan, jumlah, uang_jalan)
  select v_id, h.surat_jalan_id, h.qty, h.harga_satuan, h.jumlah, h.uang_jalan
    from internal.hitung_baris_invoice(p_lini_kode, p_pelanggan_id, p_sj_ids) h;

  update public.surat_jalan set invoice_id = v_id, diubah_oleh = v_uid, diubah_pada = now()
   where id = any (p_sj_ids);

  perform internal.catat_audit('terbit', 'invoice', v_id::text,
    jsonb_build_object('nomor', v_nomor, 'subtotal', v_subtotal, 'uang_jalan', v_uj, 'total_akhir', v_total));
  return v_id;
end;
$$;

create function public.batalkan_invoice(p_id uuid, p_alasan text, p_tanggal date default current_date)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid;
  v_inv public.invoice;
  v_jurnal uuid;
begin
  v_uid := internal.wajib_peran('owner', 'keuangan');
  select * into v_inv from public.invoice where id = p_id for update;
  if not found then
    raise exception 'Invoice tidak ditemukan' using errcode = 'P0002';
  end if;
  if v_inv.status = 'batal' then
    raise exception 'Invoice % sudah batal', v_inv.nomor using errcode = 'P0001';
  end if;
  if coalesce(trim(p_alasan), '') = '' then
    raise exception 'Alasan pembatalan wajib diisi' using errcode = 'P0001';
  end if;
  if internal.total_alokasi_invoice(p_id) > 0 then
    raise exception 'Invoice % sudah memiliki pembayaran; batalkan pembayaran dulu', v_inv.nomor using errcode = 'P0001';
  end if;
  if not v_inv.saldo_awal then
    v_jurnal := internal.balik_jurnal(v_inv.jurnal_id, p_tanggal, 'Batal invoice ' || v_inv.nomor || ': ' || trim(p_alasan));
  end if;
  update public.invoice
     set status = 'batal', jurnal_batal_id = v_jurnal, alasan_batal = trim(p_alasan)
   where id = p_id;
  update public.invoice_baris set aktif = false where invoice_id = p_id;
  update public.surat_jalan set invoice_id = null, diubah_oleh = v_uid, diubah_pada = now() where invoice_id = p_id;
  perform internal.catat_audit('batal', 'invoice', p_id::text, jsonb_build_object('alasan', p_alasan));
  return p_id;
end;
$$;

select internal.terapkan_hak_akses();
