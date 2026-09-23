-- Pembayaran pelanggan: alokasi ke banyak invoice, PPh final dipotong, pembatalan.

create table public.pembayaran (
  id uuid primary key default gen_random_uuid(),
  nomor text not null unique,
  tanggal date not null,
  pelanggan_id uuid not null references public.pelanggan (id),
  akun_kas_kode text not null references public.akun (kode),
  jumlah_diterima numeric(18,2) not null check (jumlah_diterima >= 0),
  jumlah_pph numeric(18,2) not null default 0 check (jumlah_pph >= 0),
  status text not null default 'terbit' check (status in ('terbit', 'batal')),
  jurnal_id uuid not null references public.jurnal (id),
  jurnal_batal_id uuid references public.jurnal (id),
  keterangan text not null default '',
  alasan_batal text,
  dibuat_oleh uuid,
  dibuat_pada timestamptz not null default now(),
  check (jumlah_diterima + jumlah_pph > 0)
);

create table public.pembayaran_alokasi (
  id bigint generated always as identity primary key,
  pembayaran_id uuid not null references public.pembayaran (id),
  invoice_id uuid not null references public.invoice (id),
  jumlah numeric(18,2) not null check (jumlah > 0),
  aktif boolean not null default true,
  unique (pembayaran_id, invoice_id)
);
create index pembayaran_alokasi_invoice_idx on public.pembayaran_alokasi (invoice_id) where aktif;

create or replace function internal.total_alokasi_invoice(p_invoice_id uuid) returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(a.jumlah), 0)
    from public.pembayaran_alokasi a
    join public.pembayaran p on p.id = a.pembayaran_id
   where a.invoice_id = p_invoice_id and a.aktif and p.status = 'terbit'
$$;

create function internal.wajib_akun_kas(p_kode text) returns public.akun
language plpgsql stable security definer set search_path = '' as $$
declare
  v_akun public.akun;
begin
  select * into v_akun from public.akun where kode = p_kode;
  if not found or not v_akun.kas_bank or v_akun.tipe <> 'detail' or not v_akun.aktif then
    raise exception 'Akun % bukan akun kas/bank aktif', p_kode using errcode = 'P0001';
  end if;
  return v_akun;
end;
$$;

create view public.v_invoice_saldo with (security_invoker = true) as
select i.id, i.nomor, i.lini_kode, i.pelanggan_id, p.nama as pelanggan_nama, i.tanggal, i.jatuh_tempo,
       i.subtotal, i.total_uang_jalan, i.total_akhir,
       coalesce(a.dibayar, 0)::numeric(18,2) as dibayar,
       (i.total_akhir - coalesce(a.dibayar, 0))::numeric(18,2) as sisa,
       i.status, i.saldo_awal, i.keterangan
  from public.invoice i
  join public.pelanggan p on p.id = i.pelanggan_id
  left join (
    select pa.invoice_id, sum(pa.jumlah) as dibayar
      from public.pembayaran_alokasi pa
      join public.pembayaran b on b.id = pa.pembayaran_id
     where pa.aktif and b.status = 'terbit'
     group by pa.invoice_id
  ) a on a.invoice_id = i.id;

create function public.saran_pph_invoice(p_invoice_id uuid, p_tanggal date) returns numeric
language sql stable set search_path = '' as $$
  select case
           when pj.pp55_aktif and pl.pemotong_pph and not i.saldo_awal
             then round(i.subtotal * pj.tarif_pph_final, 0)
           else 0
         end
    from public.invoice i
    join public.pelanggan pl on pl.id = i.pelanggan_id
    cross join lateral public.pajak_berlaku(p_tanggal) pj
   where i.id = p_invoice_id
$$;

create function public.catat_pembayaran(
  p_tanggal date, p_pelanggan_id uuid, p_akun_kas_kode text, p_jumlah_diterima numeric, p_jumlah_pph numeric,
  p_alokasi jsonb, p_keterangan text default '')
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid;
  v_id uuid := gen_random_uuid();
  v_nomor text;
  v_akun public.akun;
  v_diterima numeric := coalesce(p_jumlah_diterima, 0);
  v_pph numeric := coalesce(p_jumlah_pph, 0);
  v_a jsonb;
  v_inv public.invoice;
  v_jml numeric;
  v_sisa numeric;
  v_total numeric := 0;
  v_seen uuid[] := '{}';
  v_baris jsonb;
  v_piutang text;
  v_jurnal uuid;
begin
  v_uid := internal.wajib_peran('owner', 'keuangan');
  if p_tanggal is null then
    raise exception 'Tanggal pembayaran wajib diisi' using errcode = 'P0001';
  end if;
  if v_diterima < 0 or v_pph < 0 then
    raise exception 'Jumlah tidak boleh negatif' using errcode = 'P0001';
  end if;
  v_akun := internal.wajib_akun_kas(p_akun_kas_kode);
  if p_alokasi is null or jsonb_typeof(p_alokasi) <> 'array' or jsonb_array_length(p_alokasi) = 0 then
    raise exception 'Alokasi invoice wajib diisi' using errcode = 'P0001';
  end if;

  v_nomor := 'BYR-' || to_char(p_tanggal, 'YYYY') || '-'
    || lpad(internal.nomor_berikut('pembayaran-' || to_char(p_tanggal, 'YYYY'))::text, 6, '0');
  v_piutang := internal.akun_posting('piutang_usaha');
  v_baris := jsonb_build_array(
    jsonb_build_object('akun_kode', v_akun.kode, 'debit', v_diterima, 'pelanggan_id', p_pelanggan_id,
                       'keterangan', 'Penerimaan ' || v_nomor),
    jsonb_build_object('akun_kode', internal.akun_posting('beban_pph_final'), 'debit', v_pph,
                       'pelanggan_id', p_pelanggan_id, 'keterangan', 'PPh final dipotong pelanggan ' || v_nomor));

  for v_a in select value from jsonb_array_elements(p_alokasi) loop
    select * into v_inv from public.invoice where id = nullif(v_a ->> 'invoice_id', '')::uuid for update;
    if not found then
      raise exception 'Invoice tidak ditemukan' using errcode = 'P0002';
    end if;
    if v_inv.id = any (v_seen) then
      raise exception 'Invoice % dialokasikan dua kali', v_inv.nomor using errcode = 'P0001';
    end if;
    v_seen := v_seen || v_inv.id;
    if v_inv.status <> 'terbit' then
      raise exception 'Invoice % sudah batal', v_inv.nomor using errcode = 'P0001';
    end if;
    if v_inv.pelanggan_id <> p_pelanggan_id then
      raise exception 'Invoice % milik pelanggan lain', v_inv.nomor using errcode = 'P0001';
    end if;
    if p_tanggal < v_inv.tanggal then
      raise exception 'Tanggal pembayaran sebelum tanggal invoice %', v_inv.nomor using errcode = 'P0001';
    end if;
    v_jml := nullif(v_a ->> 'jumlah', '')::numeric;
    if v_jml is null or v_jml <= 0 then
      raise exception 'Jumlah alokasi invoice % harus lebih dari 0', v_inv.nomor using errcode = 'P0001';
    end if;
    v_sisa := v_inv.total_akhir - internal.total_alokasi_invoice(v_inv.id);
    if v_jml > v_sisa then
      raise exception 'Alokasi % melebihi sisa piutang invoice % (%)', v_jml, v_inv.nomor, v_sisa using errcode = 'P0001';
    end if;
    v_total := v_total + v_jml;
    v_baris := v_baris || jsonb_build_array(jsonb_build_object(
      'akun_kode', v_piutang, 'kredit', v_jml, 'pelanggan_id', p_pelanggan_id, 'lini_kode', v_inv.lini_kode,
      'keterangan', 'Pelunasan ' || v_inv.nomor));
  end loop;

  if v_total <> v_diterima + v_pph then
    raise exception 'Total alokasi (%) harus sama dengan diterima + PPh (%)', v_total, v_diterima + v_pph
      using errcode = 'P0001';
  end if;

  v_jurnal := internal.posting_jurnal(p_tanggal, 'Pembayaran ' || v_nomor, 'pembayaran', v_id, v_baris);

  insert into public.pembayaran (
    id, nomor, tanggal, pelanggan_id, akun_kas_kode, jumlah_diterima, jumlah_pph, jurnal_id, keterangan, dibuat_oleh)
  values (v_id, v_nomor, p_tanggal, p_pelanggan_id, v_akun.kode, v_diterima, v_pph, v_jurnal, coalesce(p_keterangan, ''), v_uid);

  insert into public.pembayaran_alokasi (pembayaran_id, invoice_id, jumlah)
  select v_id, (e ->> 'invoice_id')::uuid, (e ->> 'jumlah')::numeric
    from jsonb_array_elements(p_alokasi) e;

  perform internal.catat_audit('buat', 'pembayaran', v_id::text,
    jsonb_build_object('nomor', v_nomor, 'diterima', v_diterima, 'pph', v_pph));
  return v_id;
end;
$$;

create function public.batalkan_pembayaran(p_id uuid, p_alasan text, p_tanggal date default current_date)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_p public.pembayaran;
  v_jurnal uuid;
begin
  perform internal.wajib_peran('owner', 'keuangan');
  select * into v_p from public.pembayaran where id = p_id for update;
  if not found then
    raise exception 'Pembayaran tidak ditemukan' using errcode = 'P0002';
  end if;
  if v_p.status = 'batal' then
    raise exception 'Pembayaran % sudah batal', v_p.nomor using errcode = 'P0001';
  end if;
  if coalesce(trim(p_alasan), '') = '' then
    raise exception 'Alasan pembatalan wajib diisi' using errcode = 'P0001';
  end if;
  v_jurnal := internal.balik_jurnal(v_p.jurnal_id, p_tanggal, 'Batal pembayaran ' || v_p.nomor || ': ' || trim(p_alasan));
  update public.pembayaran set status = 'batal', jurnal_batal_id = v_jurnal, alasan_batal = trim(p_alasan) where id = p_id;
  update public.pembayaran_alokasi set aktif = false where pembayaran_id = p_id;
  perform internal.catat_audit('batal', 'pembayaran', p_id::text, jsonb_build_object('alasan', p_alasan));
  return p_id;
end;
$$;

select internal.terapkan_hak_akses();
