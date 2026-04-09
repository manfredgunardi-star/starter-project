-- ============================================================
-- Seed Data: Default units and Chart of Accounts
-- Run AFTER all migrations, via Supabase Dashboard SQL Editor
-- ============================================================

-- Default units (satuan)
insert into units (name) values
  ('pcs'), ('dus'), ('kg'), ('gram'), ('liter'), ('ml'),
  ('meter'), ('cm'), ('lusin'), ('rim'), ('set'), ('unit');

-- ============================================================
-- Chart of Accounts (COA) — Standar akuntansi perusahaan dagang Indonesia
-- ============================================================

-- 1-xxxxx: ASET
insert into coa (code, name, type, normal_balance) values
  ('1-00000', 'ASET', 'asset', 'debit'),
  ('1-10000', 'Aset Lancar', 'asset', 'debit'),
  ('1-11000', 'Kas', 'asset', 'debit'),
  ('1-12000', 'Bank', 'asset', 'debit'),
  ('1-13000', 'Piutang Usaha', 'asset', 'debit'),
  ('1-14000', 'Persediaan Barang', 'asset', 'debit'),
  ('1-15000', 'PPN Masukan', 'asset', 'debit'),
  ('1-16000', 'Uang Muka', 'asset', 'debit'),
  ('1-19000', 'Aset Lancar Lainnya', 'asset', 'debit'),
  ('1-20000', 'Aset Tetap', 'asset', 'debit'),
  ('1-21000', 'Peralatan', 'asset', 'debit'),
  ('1-22000', 'Kendaraan', 'asset', 'debit'),
  ('1-29000', 'Akumulasi Penyusutan', 'asset', 'debit');

-- Set parent-child relationships untuk Aset
update coa set parent_id = (select id from coa where code = '1-00000')
  where code in ('1-10000', '1-20000');
update coa set parent_id = (select id from coa where code = '1-10000')
  where code in ('1-11000', '1-12000', '1-13000', '1-14000', '1-15000', '1-16000', '1-19000');
update coa set parent_id = (select id from coa where code = '1-20000')
  where code in ('1-21000', '1-22000', '1-29000');

-- 2-xxxxx: KEWAJIBAN
insert into coa (code, name, type, normal_balance) values
  ('2-00000', 'KEWAJIBAN', 'liability', 'credit'),
  ('2-10000', 'Kewajiban Lancar', 'liability', 'credit'),
  ('2-11000', 'Hutang Usaha', 'liability', 'credit'),
  ('2-11100', 'Hutang Barang Diterima', 'liability', 'credit'),
  ('2-12000', 'PPN Keluaran', 'liability', 'credit'),
  ('2-13000', 'Hutang Pajak', 'liability', 'credit'),
  ('2-19000', 'Kewajiban Lancar Lainnya', 'liability', 'credit');

update coa set parent_id = (select id from coa where code = '2-00000')
  where code = '2-10000';
update coa set parent_id = (select id from coa where code = '2-10000')
  where code in ('2-11000', '2-11100', '2-12000', '2-13000', '2-19000');

-- 3-xxxxx: MODAL / EKUITAS
insert into coa (code, name, type, normal_balance) values
  ('3-00000', 'MODAL', 'equity', 'credit'),
  ('3-11000', 'Modal Disetor', 'equity', 'credit'),
  ('3-12000', 'Laba Ditahan', 'equity', 'credit'),
  ('3-13000', 'Laba Periode Berjalan', 'equity', 'credit');

update coa set parent_id = (select id from coa where code = '3-00000')
  where code in ('3-11000', '3-12000', '3-13000');

-- 4-xxxxx: PENDAPATAN
insert into coa (code, name, type, normal_balance) values
  ('4-00000', 'PENDAPATAN', 'revenue', 'credit'),
  ('4-11000', 'Pendapatan Penjualan', 'revenue', 'credit'),
  ('4-12000', 'Pendapatan Jasa', 'revenue', 'credit'),
  ('4-19000', 'Pendapatan Lainnya', 'revenue', 'credit');

update coa set parent_id = (select id from coa where code = '4-00000')
  where code in ('4-11000', '4-12000', '4-19000');

-- 5-xxxxx: BEBAN
insert into coa (code, name, type, normal_balance) values
  ('5-00000', 'BEBAN', 'expense', 'debit'),
  ('5-11000', 'Harga Pokok Penjualan (HPP)', 'expense', 'debit'),
  ('5-12000', 'Beban Gaji', 'expense', 'debit'),
  ('5-13000', 'Beban Sewa', 'expense', 'debit'),
  ('5-14000', 'Beban Utilitas', 'expense', 'debit'),
  ('5-15000', 'Beban Transport', 'expense', 'debit'),
  ('5-16000', 'Beban Perlengkapan', 'expense', 'debit'),
  ('5-17000', 'Beban Penyusutan', 'expense', 'debit'),
  ('5-18000', 'Beban Administrasi', 'expense', 'debit'),
  ('5-19000', 'Selisih Harga', 'expense', 'debit'),
  ('5-99000', 'Beban Lainnya', 'expense', 'debit');

update coa set parent_id = (select id from coa where code = '5-00000')
  where code like '5-1%' or code like '5-9%';
