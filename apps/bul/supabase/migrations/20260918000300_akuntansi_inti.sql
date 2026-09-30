-- Inti akuntansi: COA, pengaturan posting & pajak, kunci periode, jurnal, mesin posting, jurnal manual.

create table public.akun (
  kode text primary key check (kode ~ '^[0-9]{4}$'),
  nama text not null check (length(trim(nama)) > 0),
  induk_kode text references public.akun (kode),
  tipe text not null check (tipe in ('header', 'detail')),
  saldo_normal text not null check (saldo_normal in ('debit', 'kredit')),
  kas_bank boolean not null default false,
  aktif boolean not null default true,
  check (not kas_bank or tipe = 'detail')
);

-- Sumber: apps/bul-accounting/src/data/chartOfAccounts.js (+ 6251).
insert into public.akun (kode, nama, induk_kode, tipe, saldo_normal, kas_bank) values
  ('1000', 'ASET', null, 'header', 'debit', false),
  ('1100', 'Aset Lancar', '1000', 'header', 'debit', false),
  ('1110', 'Kas dan Setara Kas', '1100', 'header', 'debit', false),
  ('1111', 'Kas Kecil', '1110', 'detail', 'debit', true),
  ('1112', 'Bank BCA Operasional', '1110', 'detail', 'debit', true),
  ('1113', 'Bank Mandiri Operasional', '1110', 'detail', 'debit', true),
  ('1114', 'Deposito Berjangka', '1110', 'detail', 'debit', false),
  ('1120', 'Piutang Usaha', '1100', 'header', 'debit', false),
  ('1121', 'Piutang Pelanggan - Proyek', '1120', 'detail', 'debit', false),
  ('1122', 'Piutang Tagihan Belum Ditagih', '1120', 'detail', 'debit', false),
  ('1130', 'Cadangan Kerugian Piutang', '1100', 'detail', 'kredit', false),
  ('1140', 'Persediaan Operasional', '1100', 'header', 'debit', false),
  ('1141', 'Persediaan Solar/BBM', '1140', 'detail', 'debit', false),
  ('1142', 'Persediaan Oli & Pelumas', '1140', 'detail', 'debit', false),
  ('1143', 'Persediaan Sparepart', '1140', 'detail', 'debit', false),
  ('1144', 'Persediaan Ban', '1140', 'detail', 'debit', false),
  ('1150', 'Uang Muka', '1100', 'header', 'debit', false),
  ('1151', 'Uang Muka Sopir/Uang Jalan', '1150', 'detail', 'debit', false),
  ('1152', 'Uang Muka Pembelian Sparepart', '1150', 'detail', 'debit', false),
  ('1153', 'Uang Muka Pembelian BBM', '1150', 'detail', 'debit', false),
  ('1160', 'Biaya Dibayar di Muka', '1100', 'header', 'debit', false),
  ('1161', 'Sewa Dibayar di Muka', '1160', 'detail', 'debit', false),
  ('1162', 'Asuransi Dibayar di Muka', '1160', 'detail', 'debit', false),
  ('1163', 'STNK/KIR/Izin Trayek Dibayar di Muka', '1160', 'detail', 'debit', false),
  ('1170', 'Pajak Dibayar di Muka', '1100', 'header', 'debit', false),
  ('1171', 'PPN Masukan', '1170', 'detail', 'debit', false),
  ('1172', 'PPh 23 Dibayar di Muka', '1170', 'detail', 'debit', false),
  ('1173', 'PPh 25 Dibayar di Muka', '1170', 'detail', 'debit', false),
  ('1180', 'Aset Lancar Lainnya', '1100', 'header', 'debit', false),
  ('1181', 'Piutang Karyawan', '1180', 'detail', 'debit', false),
  ('1182', 'Saldo E-Toll / Deposit Tol', '1180', 'detail', 'debit', false),
  ('1200', 'Aset Tidak Lancar', '1000', 'header', 'debit', false),
  ('1210', 'Aset Tetap', '1200', 'header', 'debit', false),
  ('1211', 'Tanah', '1210', 'detail', 'debit', false),
  ('1212', 'Bangunan/Gudang', '1210', 'detail', 'debit', false),
  ('1213', 'Kendaraan Truck', '1210', 'detail', 'debit', false),
  ('1214', 'Kendaraan Operasional Kantor', '1210', 'detail', 'debit', false),
  ('1215', 'Alat Bengkel', '1210', 'detail', 'debit', false),
  ('1216', 'Peralatan Kantor', '1210', 'detail', 'debit', false),
  ('1217', 'Furnitur & Inventaris', '1210', 'detail', 'debit', false),
  ('1218', 'Komputer & Printer', '1210', 'detail', 'debit', false),
  ('1219', 'GPS/Tracker Armada', '1210', 'detail', 'debit', false),
  ('1220', 'Akumulasi Penyusutan', '1200', 'header', 'debit', false),
  ('1221', 'Akumulasi Penyusutan Bangunan/Gudang', '1220', 'detail', 'kredit', false),
  ('1222', 'Akumulasi Penyusutan Kendaraan Truck', '1220', 'detail', 'kredit', false),
  ('1223', 'Akumulasi Penyusutan Kendaraan Operasional', '1220', 'detail', 'kredit', false),
  ('1224', 'Akumulasi Penyusutan Alat Bengkel', '1220', 'detail', 'kredit', false),
  ('1225', 'Akumulasi Penyusutan Peralatan Kantor', '1220', 'detail', 'kredit', false),
  ('1226', 'Akumulasi Penyusutan Furnitur & Inventaris', '1220', 'detail', 'kredit', false),
  ('1227', 'Akumulasi Penyusutan Komputer & Printer', '1220', 'detail', 'kredit', false),
  ('1228', 'Akumulasi Penyusutan GPS/Tracker Armada', '1220', 'detail', 'kredit', false),
  ('1240', 'Aset Lain-lain', '1200', 'header', 'debit', false),
  ('1241', 'Uang Jaminan', '1240', 'detail', 'debit', false),
  ('1242', 'Deposit Sewa', '1240', 'detail', 'debit', false),
  ('2000', 'KEWAJIBAN', null, 'header', 'kredit', false),
  ('2100', 'Kewajiban Lancar', '2000', 'header', 'kredit', false),
  ('2110', 'Hutang Usaha', '2100', 'header', 'kredit', false),
  ('2111', 'Hutang Supplier BBM', '2110', 'detail', 'kredit', false),
  ('2112', 'Hutang Supplier Sparepart', '2110', 'detail', 'kredit', false),
  ('2113', 'Hutang Bengkel/Servis', '2110', 'detail', 'kredit', false),
  ('2114', 'Hutang Vendor Lainnya', '2110', 'detail', 'kredit', false),
  ('2120', 'Hutang Operasional', '2100', 'header', 'kredit', false),
  ('2121', 'Hutang Gaji dan Upah', '2120', 'detail', 'kredit', false),
  ('2122', 'Hutang Uang Jalan Sopir', '2120', 'detail', 'kredit', false),
  ('2123', 'Hutang Tol/Parkir/Retribusi', '2120', 'detail', 'kredit', false),
  ('2124', 'Biaya Masih Harus Dibayar', '2120', 'detail', 'kredit', false),
  ('2130', 'Hutang Pajak', '2100', 'header', 'kredit', false),
  ('2131', 'Hutang PPh 21', '2130', 'detail', 'kredit', false),
  ('2132', 'Hutang PPh 23', '2130', 'detail', 'kredit', false),
  ('2133', 'Hutang PPh 29', '2130', 'detail', 'kredit', false),
  ('2134', 'Hutang PPN Keluaran', '2130', 'detail', 'kredit', false),
  ('2135', 'Hutang Pajak Kendaraan', '2130', 'detail', 'kredit', false),
  ('2140', 'Pendapatan Diterima di Muka', '2100', 'header', 'kredit', false),
  ('2141', 'Uang Muka Pelanggan', '2140', 'detail', 'kredit', false),
  ('2150', 'Hutang Jangka Pendek Lainnya', '2100', 'header', 'kredit', false),
  ('2151', 'Hutang Leasing Jatuh Tempo < 1 Tahun', '2150', 'detail', 'kredit', false),
  ('2152', 'Hutang Bank Jangka Pendek', '2150', 'detail', 'kredit', false),
  ('2153', 'Hutang Pemegang Saham', '2150', 'detail', 'kredit', false),
  ('2200', 'Kewajiban Jangka Panjang', '2000', 'header', 'kredit', false),
  ('2210', 'Hutang Bank Jangka Panjang', '2200', 'detail', 'kredit', false),
  ('2220', 'Hutang Leasing Kendaraan > 1 Tahun', '2200', 'detail', 'kredit', false),
  ('2230', 'Liabilitas Imbalan Kerja', '2200', 'detail', 'kredit', false),
  ('2240', 'Kewajiban Jangka Panjang Lainnya', '2200', 'detail', 'kredit', false),
  ('3000', 'EKUITAS', null, 'header', 'kredit', false),
  ('3100', 'Modal', '3000', 'header', 'kredit', false),
  ('3110', 'Modal Disetor', '3100', 'detail', 'kredit', false),
  ('3120', 'Tambahan Modal Disetor', '3100', 'detail', 'kredit', false),
  ('3200', 'Saldo Laba', '3000', 'header', 'kredit', false),
  ('3210', 'Saldo Laba Ditahan', '3200', 'detail', 'kredit', false),
  ('3220', 'Laba/Rugi Tahun Berjalan', '3200', 'detail', 'kredit', false),
  ('3230', 'Prive Pemilik', '3000', 'detail', 'debit', false),
  ('4000', 'PENDAPATAN', null, 'header', 'kredit', false),
  ('4100', 'Pendapatan Usaha', '4000', 'detail', 'kredit', false),
  ('4200', 'Potongan & Penyesuaian Pendapatan', '4000', 'header', 'kredit', false),
  ('4210', 'Potongan Penjualan Jasa', '4200', 'detail', 'debit', false),
  ('5000', 'BEBAN POKOK PENDAPATAN', null, 'header', 'debit', false),
  ('5100', 'Beban Langsung Armada', '5000', 'header', 'debit', false),
  ('5110', 'BBM Armada', '5100', 'detail', 'debit', false),
  ('5120', 'Oli & Pelumas Armada', '5100', 'detail', 'debit', false),
  ('5130', 'Upah Sopir', '5100', 'detail', 'debit', false),
  ('5140', 'Upah Kernet/Helper', '5100', 'detail', 'debit', false),
  ('5150', 'Uang Jalan, Makan & Penginapan Sopir', '5100', 'detail', 'debit', false),
  ('5160', 'Tol, Parkir & Retribusi Jalan', '5100', 'detail', 'debit', false),
  ('5170', 'Jasa Bongkar Muat/Loader', '5100', 'detail', 'debit', false),
  ('5180', 'Komisi Ritase/Dispatcher', '5100', 'detail', 'debit', false),
  ('5190', 'Sewa Truck Pihak Ketiga', '5100', 'detail', 'debit', false),
  ('5200', 'Perawatan Armada', '5000', 'header', 'debit', false),
  ('5210', 'Servis & Perbaikan Berkala', '5200', 'detail', 'debit', false),
  ('5220', 'Sparepart Armada', '5200', 'detail', 'debit', false),
  ('5230', 'Ban & Vulkanisir', '5200', 'detail', 'debit', false),
  ('5240', 'Cuci, Grease & Aksesoris Kecil', '5200', 'detail', 'debit', false),
  ('5250', 'STNK, KIR & Izin Trayek', '5200', 'detail', 'debit', false),
  ('5260', 'Asuransi Armada', '5200', 'detail', 'debit', false),
  ('5270', 'Penyusutan Truck', '5200', 'detail', 'debit', false),
  ('5280', 'Klaim/Kerusakan Muatan', '5200', 'detail', 'debit', false),
  ('6000', 'BEBAN USAHA / OPERASIONAL', null, 'header', 'debit', false),
  ('6100', 'Beban Umum & Administrasi', '6000', 'header', 'debit', false),
  ('6110', 'Gaji Staf Kantor', '6100', 'detail', 'debit', false),
  ('6120', 'Tunjangan & Lembur Staf', '6100', 'detail', 'debit', false),
  ('6130', 'BPJS Tenaga Kerja & Kesehatan', '6100', 'detail', 'debit', false),
  ('6140', 'ATK & Cetakan Surat Jalan', '6100', 'detail', 'debit', false),
  ('6150', 'Listrik, Air & Internet', '6100', 'detail', 'debit', false),
  ('6160', 'Telepon & Pulsa Operasional', '6100', 'detail', 'debit', false),
  ('6170', 'Sewa Kantor/Gudang', '6100', 'detail', 'debit', false),
  ('6180', 'Perawatan Kantor/Gudang', '6100', 'detail', 'debit', false),
  ('6190', 'Bahan Kebersihan & Rumah Tangga', '6100', 'detail', 'debit', false),
  ('6200', 'Beban Administrasi', '6000', 'header', 'debit', false),
  ('6210', 'Administrasi Bank', '6200', 'detail', 'debit', false),
  ('6220', 'Biaya Transfer & Materai', '6200', 'detail', 'debit', false),
  ('6230', 'Jasa Profesional (Akuntan/Konsultan/Legal)', '6200', 'detail', 'debit', false),
  ('6240', 'Perizinan & Legalitas Usaha', '6200', 'detail', 'debit', false),
  ('6250', 'Pajak & Retribusi Perusahaan', '6200', 'detail', 'debit', false),
  ('6260', 'Penyusutan Aset Kantor', '6200', 'detail', 'debit', false),
  ('6270', 'Amortisasi Aset Lainnya', '6200', 'detail', 'debit', false),
  ('6280', 'Software & Langganan Sistem', '6200', 'detail', 'debit', false),
  ('6290', 'Beban Piutang Tak Tertagih', '6200', 'detail', 'debit', false),
  ('6300', 'Beban Pemasaran & Lainnya', '6000', 'header', 'debit', false),
  ('6310', 'Promosi & Pemasaran', '6300', 'detail', 'debit', false),
  ('6320', 'Jamuan & Representasi', '6300', 'detail', 'debit', false),
  ('6330', 'Perjalanan Dinas', '6300', 'detail', 'debit', false),
  ('6340', 'Pelatihan & Rekrutmen', '6300', 'detail', 'debit', false),
  ('6350', 'Sumbangan', '6300', 'detail', 'debit', false),
  ('6360', 'Beban Lain-lain Operasional', '6300', 'detail', 'debit', false),
  ('7000', 'PENDAPATAN LAIN-LAIN', null, 'header', 'kredit', false),
  ('7100', 'Pendapatan Bunga Bank', '7000', 'detail', 'kredit', false),
  ('7110', 'Keuntungan Penjualan Aset Tetap', '7000', 'detail', 'kredit', false),
  ('7120', 'Pendapatan Klaim Asuransi', '7000', 'detail', 'kredit', false),
  ('7130', 'Pendapatan Selisih Kurs', '7000', 'detail', 'kredit', false),
  ('7140', 'Pendapatan Lain-lain', '7000', 'detail', 'kredit', false),
  ('8000', 'BEBAN LAIN-LAIN', null, 'header', 'debit', false),
  ('8100', 'Beban Bunga Bank', '8000', 'detail', 'debit', false),
  ('8110', 'Beban Bunga Leasing', '8000', 'detail', 'debit', false),
  ('8120', 'Denda & Penalti', '8000', 'detail', 'debit', false),
  ('8130', 'Kerugian Penjualan Aset Tetap', '8000', 'detail', 'debit', false),
  ('8140', 'Beban Selisih Kurs', '8000', 'detail', 'debit', false),
  ('8150', 'Beban Lain-lain', '8000', 'detail', 'debit', false),
  ('9000', 'AKUN PENUTUP', null, 'header', 'debit', false),
  ('9100', 'Ikhtisar Laba/Rugi', '9000', 'detail', 'kredit', false),
  ('9110', 'Pajak Penghasilan Badan', '9000', 'detail', 'debit', false),
  ('6251', 'Beban PPh Final UMKM (PP 55)', '6200', 'detail', 'debit', false)
;

create function public.kategori_akun(p_kode text) returns text
language sql immutable set search_path = '' as $$
  select case left(p_kode, 1)
    when '1' then 'aset' when '2' then 'kewajiban' when '3' then 'ekuitas'
    when '4' then 'pendapatan' when '5' then 'hpp' when '6' then 'beban'
    when '7' then 'pendapatan_lain' when '8' then 'beban_lain' else 'penutup' end
$$;

create table public.pengaturan_posting (
  kunci text primary key check (kunci in (
    'piutang_usaha', 'pendapatan_jasa', 'beban_uang_jalan', 'beban_upah_sopir', 'hutang_upah_sopir', 'beban_pph_final')),
  akun_kode text not null references public.akun (kode),
  keterangan text not null
);
insert into public.pengaturan_posting (kunci, akun_kode, keterangan) values
  ('piutang_usaha', '1121', 'Piutang pelanggan (bersih setelah potong uang jalan)'),
  ('pendapatan_jasa', '4100', 'Pendapatan jasa angkut (bruto)'),
  ('beban_uang_jalan', '5150', 'Uang jalan diakui saat invoice terbit'),
  ('beban_upah_sopir', '5130', 'Upah supir diakui saat SJ selesai'),
  ('hutang_upah_sopir', '2121', 'Hutang upah supir sampai dibayar'),
  ('beban_pph_final', '6251', 'PPh final PP 55 yang dipotong pelanggan');

create table public.pengaturan_pajak (
  berlaku_mulai date primary key,
  pp55_aktif boolean not null,
  tarif_pph_final numeric(6,4) not null check (tarif_pph_final >= 0 and tarif_pph_final < 1),
  batas_omzet numeric(18,2) not null check (batas_omzet > 0)
);
insert into public.pengaturan_pajak values ('2026-01-01', true, 0.005, 4800000000);

create table public.kunci_periode (
  id boolean primary key default true check (id),
  terkunci_sampai date
);
insert into public.kunci_periode (id, terkunci_sampai) values (true, null);

create table public.jurnal (
  id uuid primary key default gen_random_uuid(),
  nomor text not null unique,
  tanggal date not null,
  keterangan text not null check (length(trim(keterangan)) > 0),
  sumber_tipe text not null check (sumber_tipe in (
    'saldo_awal', 'sj_selesai', 'invoice', 'pembayaran', 'kas', 'manual', 'pembalik')),
  sumber_id uuid,
  membalik_id uuid references public.jurnal (id),
  dibalik_oleh_id uuid references public.jurnal (id),
  dibuat_oleh uuid references auth.users (id),
  dibuat_pada timestamptz not null default now()
);
create unique index jurnal_satu_pembalik on public.jurnal (membalik_id) where membalik_id is not null;
create index jurnal_tanggal_idx on public.jurnal (tanggal);
create index jurnal_sumber_idx on public.jurnal (sumber_tipe, sumber_id);

create table public.jurnal_baris (
  id bigint generated always as identity primary key,
  jurnal_id uuid not null references public.jurnal (id),
  urutan int not null,
  akun_kode text not null references public.akun (kode),
  debit numeric(18,2) not null default 0 check (debit >= 0),
  kredit numeric(18,2) not null default 0 check (kredit >= 0),
  keterangan text not null check (length(trim(keterangan)) > 0),
  lini_kode text references public.lini (kode),
  truk_id uuid references public.truk (id),
  supir_id uuid references public.supir (id),
  pelanggan_id uuid references public.pelanggan (id),
  rute_id uuid references public.rute (id),
  check ((debit > 0) <> (kredit > 0)),
  unique (jurnal_id, urutan)
);
create index jurnal_baris_akun_idx on public.jurnal_baris (akun_kode);

-- Keseimbangan dicek saat COMMIT. tg_argv[0] = nama kolom id jurnal pada tabel pemicu.
create function internal.cek_jurnal_seimbang() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_id uuid := (to_jsonb(new) ->> tg_argv[0])::uuid;
  v_d numeric;
  v_k numeric;
  v_n int;
begin
  select coalesce(sum(debit), 0), coalesce(sum(kredit), 0), count(*)
    into v_d, v_k, v_n
    from public.jurnal_baris where jurnal_id = v_id;
  if v_n < 2 or v_d <> v_k then
    raise exception 'Jurnal % tidak seimbang (debit %, kredit %, baris %)', v_id, v_d, v_k, v_n
      using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger trg_jurnal_seimbang
  after insert on public.jurnal deferrable initially deferred
  for each row execute function internal.cek_jurnal_seimbang('id');
create constraint trigger trg_jurnal_baris_seimbang
  after insert on public.jurnal_baris deferrable initially deferred
  for each row execute function internal.cek_jurnal_seimbang('jurnal_id');

create function internal.tolak_ubah_jurnal() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Jurnal tidak boleh dihapus; gunakan jurnal pembalik' using errcode = 'P0001';
  end if;
  if tg_table_name = 'jurnal'
     and (to_jsonb(old) ->> 'dibalik_oleh_id') is null
     and (to_jsonb(new) ->> 'dibalik_oleh_id') is not null
     and (to_jsonb(new) - 'dibalik_oleh_id') = (to_jsonb(old) - 'dibalik_oleh_id') then
    return new;
  end if;
  raise exception 'Jurnal yang sudah diposting tidak boleh diubah' using errcode = 'P0001';
end;
$$;

create trigger trg_jurnal_tetap before update or delete on public.jurnal
  for each row execute function internal.tolak_ubah_jurnal();
create trigger trg_jurnal_baris_tetap before update or delete on public.jurnal_baris
  for each row execute function internal.tolak_ubah_jurnal();

create function internal.akun_posting(p_kunci text) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  v_kode text;
begin
  select pp.akun_kode into v_kode
    from public.pengaturan_posting pp join public.akun a on a.kode = pp.akun_kode
   where pp.kunci = p_kunci and a.tipe = 'detail' and a.aktif;
  if v_kode is null then
    raise exception 'Pengaturan posting % belum valid', p_kunci using errcode = 'P0001';
  end if;
  return v_kode;
end;
$$;

create function internal.posting_jurnal(
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
      lini_kode, truk_id, supir_id, pelanggan_id, rute_id)
    values (
      v_id, v_i, v_akun.kode, v_debit, v_kredit,
      coalesce(nullif(trim(v_b ->> 'keterangan'), ''), p_keterangan),
      nullif(v_b ->> 'lini_kode', ''),
      nullif(v_b ->> 'truk_id', '')::uuid,
      nullif(v_b ->> 'supir_id', '')::uuid,
      nullif(v_b ->> 'pelanggan_id', '')::uuid,
      nullif(v_b ->> 'rute_id', '')::uuid);
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

create function internal.balik_jurnal(p_jurnal_id uuid, p_tanggal date, p_alasan text)
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
           'pelanggan_id', b.pelanggan_id, 'rute_id', b.rute_id) order by b.urutan)
    into v_baris
    from public.jurnal_baris b where b.jurnal_id = p_jurnal_id;
  v_id := internal.posting_jurnal(
    p_tanggal, 'Pembalik ' || v_asal.nomor || ': ' || trim(p_alasan), 'pembalik', v_asal.sumber_id, v_baris, p_jurnal_id);
  update public.jurnal set dibalik_oleh_id = v_id where id = p_jurnal_id;
  return v_id;
end;
$$;

create view public.v_buku_besar with (security_invoker = true) as
select j.id as jurnal_id, j.nomor, j.tanggal, j.keterangan as jurnal_keterangan, j.sumber_tipe, j.sumber_id,
       j.membalik_id, j.dibalik_oleh_id, b.id as baris_id, b.urutan, b.akun_kode, a.nama as akun_nama,
       b.debit, b.kredit, b.keterangan, b.lini_kode, b.truk_id, b.supir_id, b.pelanggan_id, b.rute_id
  from public.jurnal_baris b
  join public.jurnal j on j.id = b.jurnal_id
  join public.akun a on a.kode = b.akun_kode;

create function public.pajak_berlaku(p_tanggal date)
returns table (berlaku_mulai date, pp55_aktif boolean, tarif_pph_final numeric, batas_omzet numeric)
language sql stable set search_path = '' as $$
  select p.berlaku_mulai, p.pp55_aktif, p.tarif_pph_final, p.batas_omzet
    from public.pengaturan_pajak p
   where p.berlaku_mulai <= p_tanggal
   order by p.berlaku_mulai desc limit 1
$$;

create function public.simpan_akun(
  p_kode text, p_nama text, p_induk_kode text, p_tipe text, p_saldo_normal text,
  p_kas_bank boolean default false, p_aktif boolean default true)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_induk public.akun;
  v_lama public.akun;
begin
  perform internal.wajib_peran('owner');
  if coalesce(trim(p_nama), '') = '' then
    raise exception 'Nama akun wajib diisi' using errcode = 'P0001';
  end if;
  if p_induk_kode is not null then
    select * into v_induk from public.akun where kode = p_induk_kode;
    if not found or v_induk.tipe <> 'header' then
      raise exception 'Induk % harus akun header', p_induk_kode using errcode = 'P0001';
    end if;
  end if;
  select * into v_lama from public.akun where kode = p_kode;
  if found then
    if v_lama.tipe = 'detail' and p_tipe = 'header'
       and exists (select 1 from public.jurnal_baris b where b.akun_kode = p_kode) then
      raise exception 'Akun % sudah dipakai jurnal, tidak bisa dijadikan header', p_kode using errcode = 'P0001';
    end if;
    if not coalesce(p_aktif, true)
       and exists (select 1 from public.pengaturan_posting pp where pp.akun_kode = p_kode) then
      raise exception 'Akun % dipakai pengaturan posting, tidak bisa dinonaktifkan', p_kode using errcode = 'P0001';
    end if;
    update public.akun
       set nama = trim(p_nama), induk_kode = p_induk_kode, tipe = p_tipe, saldo_normal = p_saldo_normal,
           kas_bank = coalesce(p_kas_bank, false), aktif = coalesce(p_aktif, true)
     where kode = p_kode;
  else
    insert into public.akun (kode, nama, induk_kode, tipe, saldo_normal, kas_bank, aktif)
    values (p_kode, trim(p_nama), p_induk_kode, p_tipe, p_saldo_normal, coalesce(p_kas_bank, false), coalesce(p_aktif, true));
  end if;
  perform internal.catat_audit('simpan', 'akun', p_kode,
    jsonb_build_object('nama', p_nama, 'tipe', p_tipe, 'aktif', p_aktif));
  return p_kode;
end;
$$;

create function public.atur_pengaturan_posting(p_kunci text, p_akun_kode text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform internal.wajib_peran('owner');
  if not exists (select 1 from public.akun a where a.kode = p_akun_kode and a.tipe = 'detail' and a.aktif) then
    raise exception 'Akun % harus akun detail aktif', p_akun_kode using errcode = 'P0001';
  end if;
  update public.pengaturan_posting set akun_kode = p_akun_kode where kunci = p_kunci;
  if not found then
    raise exception 'Kunci pengaturan % tidak dikenal', p_kunci using errcode = 'P0002';
  end if;
  perform internal.catat_audit('atur', 'pengaturan_posting', p_kunci, jsonb_build_object('akun_kode', p_akun_kode));
end;
$$;

create function public.simpan_pengaturan_pajak(
  p_berlaku_mulai date, p_pp55_aktif boolean, p_tarif_pph_final numeric, p_batas_omzet numeric)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform internal.wajib_peran('owner');
  insert into public.pengaturan_pajak (berlaku_mulai, pp55_aktif, tarif_pph_final, batas_omzet)
  values (p_berlaku_mulai, p_pp55_aktif, p_tarif_pph_final, p_batas_omzet)
  on conflict (berlaku_mulai) do update
    set pp55_aktif = excluded.pp55_aktif, tarif_pph_final = excluded.tarif_pph_final, batas_omzet = excluded.batas_omzet;
  perform internal.catat_audit('simpan', 'pengaturan_pajak', p_berlaku_mulai::text,
    jsonb_build_object('pp55_aktif', p_pp55_aktif, 'tarif', p_tarif_pph_final, 'batas', p_batas_omzet));
end;
$$;

create function public.atur_kunci_periode(p_sampai date)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform internal.wajib_peran('owner');
  update public.kunci_periode set terkunci_sampai = p_sampai where id;
  perform internal.catat_audit('atur', 'kunci_periode', null, jsonb_build_object('terkunci_sampai', p_sampai));
end;
$$;

create function public.buat_jurnal_manual(p_tanggal date, p_keterangan text, p_baris jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_b jsonb;
  v_piutang text;
  v_hutang text;
  v_id uuid;
begin
  perform internal.wajib_peran('owner', 'keuangan');
  if coalesce(trim(p_keterangan), '') = '' then
    raise exception 'Keterangan jurnal wajib diisi' using errcode = 'P0001';
  end if;
  if p_baris is null or jsonb_typeof(p_baris) <> 'array' then
    raise exception 'Baris jurnal harus berupa daftar' using errcode = 'P0001';
  end if;
  v_piutang := internal.akun_posting('piutang_usaha');
  v_hutang := internal.akun_posting('hutang_upah_sopir');
  for v_b in select value from jsonb_array_elements(p_baris) loop
    if v_b ->> 'akun_kode' = v_piutang then
      raise exception 'Akun piutang usaha hanya boleh lewat invoice dan pembayaran' using errcode = 'P0001';
    end if;
    if v_b ->> 'akun_kode' = v_hutang and nullif(v_b ->> 'supir_id', '') is null then
      raise exception 'Baris hutang upah wajib memilih supir' using errcode = 'P0001';
    end if;
  end loop;
  v_id := internal.posting_jurnal(p_tanggal, trim(p_keterangan), 'manual', null, p_baris);
  perform internal.catat_audit('buat', 'jurnal', v_id::text, jsonb_build_object('tanggal', p_tanggal));
  return v_id;
end;
$$;

create function public.batalkan_jurnal_manual(p_id uuid, p_alasan text, p_tanggal date default current_date)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_j public.jurnal;
  v_id uuid;
begin
  perform internal.wajib_peran('owner', 'keuangan');
  select * into v_j from public.jurnal where id = p_id;
  if not found then
    raise exception 'Jurnal tidak ditemukan' using errcode = 'P0002';
  end if;
  if v_j.sumber_tipe <> 'manual' then
    raise exception 'Hanya jurnal manual yang dibatalkan di sini; batalkan dokumen sumbernya' using errcode = 'P0001';
  end if;
  v_id := internal.balik_jurnal(p_id, p_tanggal, p_alasan);
  perform internal.catat_audit('batal', 'jurnal', p_id::text, jsonb_build_object('pembalik', v_id, 'alasan', p_alasan));
  return v_id;
end;
$$;

select internal.terapkan_hak_akses();
