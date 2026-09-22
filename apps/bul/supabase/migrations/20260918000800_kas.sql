-- Kas & bank: pengeluaran/penerimaan multi-baris, transfer, pembatalan.

create table public.transaksi_kas (
  id uuid primary key default gen_random_uuid(),
  nomor text not null unique,
  jenis text not null check (jenis in ('keluar', 'masuk', 'transfer')),
  tanggal date not null,
  akun_kas_kode text not null references public.akun (kode),
  akun_tujuan_kode text references public.akun (kode),
  total numeric(18,2) not null check (total > 0),
  keterangan text not null check (length(trim(keterangan)) > 0),
  status text not null default 'terbit' check (status in ('terbit', 'batal')),
  jurnal_id uuid not null references public.jurnal (id),
  jurnal_batal_id uuid references public.jurnal (id),
  alasan_batal text,
  dibuat_oleh uuid,
  dibuat_pada timestamptz not null default now(),
  check ((jenis = 'transfer') = (akun_tujuan_kode is not null))
);
create index transaksi_kas_tanggal_idx on public.transaksi_kas (tanggal);

create table public.transaksi_kas_baris (
  id bigint generated always as identity primary key,
  transaksi_id uuid not null references public.transaksi_kas (id),
  urutan int not null,
  akun_kode text not null references public.akun (kode),
  jumlah numeric(18,2) not null check (jumlah > 0),
  keterangan text not null,
  lini_kode text references public.lini (kode),
  truk_id uuid references public.truk (id),
  supir_id uuid references public.supir (id),
  unique (transaksi_id, urutan)
);

create function public.catat_kas(p_jenis text, p_tanggal date, p_akun_kas_kode text, p_keterangan text, p_baris jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid;
  v_id uuid := gen_random_uuid();
  v_nomor text;
  v_kas public.akun;
  v_akun public.akun;
  v_b jsonb;
  v_jml numeric;
  v_total numeric := 0;
  v_jurnal_baris jsonb := '[]'::jsonb;
  v_piutang text;
  v_hutang_upah text;
  v_jurnal uuid;
  v_awalan text;
begin
  v_uid := internal.wajib_peran('owner', 'keuangan');
  if p_jenis is null or p_jenis not in ('keluar', 'masuk') then
    raise exception 'Jenis harus keluar atau masuk; gunakan transfer_kas untuk transfer' using errcode = 'P0001';
  end if;
  if p_tanggal is null then
    raise exception 'Tanggal wajib diisi' using errcode = 'P0001';
  end if;
  if coalesce(trim(p_keterangan), '') = '' then
    raise exception 'Keterangan wajib diisi' using errcode = 'P0001';
  end if;
  v_kas := internal.wajib_akun_kas(p_akun_kas_kode);
  if p_baris is null or jsonb_typeof(p_baris) <> 'array' or jsonb_array_length(p_baris) = 0 then
    raise exception 'Minimal satu baris' using errcode = 'P0001';
  end if;
  v_piutang := internal.akun_posting('piutang_usaha');
  v_hutang_upah := internal.akun_posting('hutang_upah_sopir');

  for v_b in select value from jsonb_array_elements(p_baris) loop
    select * into v_akun from public.akun where kode = v_b ->> 'akun_kode';
    if not found then
      raise exception 'Akun % tidak ada', v_b ->> 'akun_kode' using errcode = 'P0001';
    end if;
    if v_akun.kas_bank then
      raise exception 'Gunakan transfer_kas untuk memindahkan dana antar kas/bank' using errcode = 'P0001';
    end if;
    if v_akun.kode = v_piutang then
      raise exception 'Penerimaan piutang dicatat lewat Pembayaran' using errcode = 'P0001';
    end if;
    if v_akun.kode = v_hutang_upah and nullif(v_b ->> 'supir_id', '') is null then
      raise exception 'Pembayaran upah wajib memilih supir' using errcode = 'P0001';
    end if;
    v_jml := nullif(v_b ->> 'jumlah', '')::numeric;
    if v_jml is null or v_jml <= 0 then
      raise exception 'Jumlah setiap baris harus lebih dari 0' using errcode = 'P0001';
    end if;
    v_total := v_total + v_jml;
    v_jurnal_baris := v_jurnal_baris || jsonb_build_array(
      jsonb_build_object(
        'akun_kode', v_akun.kode,
        case when p_jenis = 'keluar' then 'debit' else 'kredit' end, v_jml,
        'keterangan', coalesce(nullif(trim(v_b ->> 'keterangan'), ''), trim(p_keterangan)),
        'lini_kode', v_b ->> 'lini_kode', 'truk_id', v_b ->> 'truk_id', 'supir_id', v_b ->> 'supir_id'));
  end loop;

  v_jurnal_baris := v_jurnal_baris || jsonb_build_array(jsonb_build_object(
    'akun_kode', v_kas.kode,
    case when p_jenis = 'keluar' then 'kredit' else 'debit' end, v_total,
    'keterangan', trim(p_keterangan)));

  v_awalan := case when p_jenis = 'keluar' then 'KK' else 'KM' end;
  v_nomor := v_awalan || '-' || to_char(p_tanggal, 'YYYY') || '-'
    || lpad(internal.nomor_berikut('kas-' || v_awalan || '-' || to_char(p_tanggal, 'YYYY'))::text, 6, '0');
  v_jurnal := internal.posting_jurnal(p_tanggal, v_nomor || ' ' || trim(p_keterangan), 'kas', v_id, v_jurnal_baris);

  insert into public.transaksi_kas (id, nomor, jenis, tanggal, akun_kas_kode, total, keterangan, jurnal_id, dibuat_oleh)
  values (v_id, v_nomor, p_jenis, p_tanggal, v_kas.kode, v_total, trim(p_keterangan), v_jurnal, v_uid);

  insert into public.transaksi_kas_baris (transaksi_id, urutan, akun_kode, jumlah, keterangan, lini_kode, truk_id, supir_id)
  select v_id, e.ord, e.val ->> 'akun_kode', (e.val ->> 'jumlah')::numeric,
         coalesce(nullif(trim(e.val ->> 'keterangan'), ''), trim(p_keterangan)),
         nullif(e.val ->> 'lini_kode', ''), nullif(e.val ->> 'truk_id', '')::uuid, nullif(e.val ->> 'supir_id', '')::uuid
    from jsonb_array_elements(p_baris) with ordinality as e(val, ord);

  perform internal.catat_audit('buat', 'transaksi_kas', v_id::text,
    jsonb_build_object('nomor', v_nomor, 'jenis', p_jenis, 'total', v_total));
  return v_id;
end;
$$;

create function public.transfer_kas(p_tanggal date, p_dari_kode text, p_ke_kode text, p_jumlah numeric, p_keterangan text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid;
  v_id uuid := gen_random_uuid();
  v_dari public.akun;
  v_ke public.akun;
  v_nomor text;
  v_jurnal uuid;
begin
  v_uid := internal.wajib_peran('owner', 'keuangan');
  v_dari := internal.wajib_akun_kas(p_dari_kode);
  v_ke := internal.wajib_akun_kas(p_ke_kode);
  if v_dari.kode = v_ke.kode then
    raise exception 'Akun asal dan tujuan transfer harus berbeda' using errcode = 'P0001';
  end if;
  if p_jumlah is null or p_jumlah <= 0 then
    raise exception 'Jumlah transfer harus lebih dari 0' using errcode = 'P0001';
  end if;
  if coalesce(trim(p_keterangan), '') = '' then
    raise exception 'Keterangan wajib diisi' using errcode = 'P0001';
  end if;
  v_nomor := 'TF-' || to_char(p_tanggal, 'YYYY') || '-'
    || lpad(internal.nomor_berikut('kas-TF-' || to_char(p_tanggal, 'YYYY'))::text, 6, '0');
  v_jurnal := internal.posting_jurnal(p_tanggal, v_nomor || ' ' || trim(p_keterangan), 'kas', v_id, jsonb_build_array(
    jsonb_build_object('akun_kode', v_ke.kode, 'debit', p_jumlah),
    jsonb_build_object('akun_kode', v_dari.kode, 'kredit', p_jumlah)));
  insert into public.transaksi_kas (id, nomor, jenis, tanggal, akun_kas_kode, akun_tujuan_kode, total, keterangan, jurnal_id, dibuat_oleh)
  values (v_id, v_nomor, 'transfer', p_tanggal, v_dari.kode, v_ke.kode, p_jumlah, trim(p_keterangan), v_jurnal, v_uid);
  perform internal.catat_audit('buat', 'transaksi_kas', v_id::text, jsonb_build_object('nomor', v_nomor, 'jenis', 'transfer'));
  return v_id;
end;
$$;

create function public.batalkan_kas(p_id uuid, p_alasan text, p_tanggal date default current_date)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_t public.transaksi_kas;
  v_jurnal uuid;
begin
  perform internal.wajib_peran('owner', 'keuangan');
  select * into v_t from public.transaksi_kas where id = p_id for update;
  if not found then
    raise exception 'Transaksi kas tidak ditemukan' using errcode = 'P0002';
  end if;
  if v_t.status = 'batal' then
    raise exception 'Transaksi % sudah batal', v_t.nomor using errcode = 'P0001';
  end if;
  if coalesce(trim(p_alasan), '') = '' then
    raise exception 'Alasan pembatalan wajib diisi' using errcode = 'P0001';
  end if;
  v_jurnal := internal.balik_jurnal(v_t.jurnal_id, p_tanggal, 'Batal ' || v_t.nomor || ': ' || trim(p_alasan));
  update public.transaksi_kas set status = 'batal', jurnal_batal_id = v_jurnal, alasan_batal = trim(p_alasan) where id = p_id;
  perform internal.catat_audit('batal', 'transaksi_kas', p_id::text, jsonb_build_object('alasan', p_alasan));
  return p_id;
end;
$$;

select internal.terapkan_hak_akses();
