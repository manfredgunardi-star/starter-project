import { expect, test } from '@playwright/test';

async function runContactLifecycle(page, config) {
  const suffix = Date.now().toString().slice(-6);
  const code = `${config.codePrefix}-${suffix}`;
  const name = `${config.namePrefix} Agent Test ${suffix}`;
  const updatedPhone = `0812${suffix}`;

  await page.goto(config.path);
  await expect(page.getByRole('heading', { name: config.title })).toBeVisible();

  await page.getByRole('button', { name: config.addButton }).click();
  await expect(page.getByRole('heading', { name: config.addHeading })).toBeVisible();

  await page.getByLabel('Kode').fill(code);
  await page.getByLabel('Nama').fill(name);
  await page.getByLabel('Telepon').fill('081200000000');
  await page.getByLabel('Email').fill(`agent-${suffix}@example.test`);
  await page.getByLabel('NPWP').fill('09.876.543.2-100.000');
  await page.getByLabel('Alamat').fill('Jl. Testing Agent No. 1');
  await page.getByLabel('Catatan').fill(`Dibuat oleh Playwright AI test agent untuk ${config.title}.`);
  await page.getByRole('button', { name: 'Simpan' }).click();

  await expect(page.getByText(name)).toBeVisible();
  await expect(page.getByText(code)).toBeVisible();

  await page.getByText(name).click();
  await expect(page.getByRole('heading', { name: config.editHeading })).toBeVisible();
  await page.getByLabel('Telepon').fill(updatedPhone);
  await page.getByLabel('Catatan').fill(`Diperbarui oleh Playwright AI test agent untuk ${config.title}.`);
  await page.getByRole('button', { name: 'Simpan' }).click();

  await expect(page.getByText(updatedPhone)).toBeVisible();

  await page.getByText(name).click();
  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain(name);
    await dialog.accept();
  });
  await page.getByRole('button', { name: 'Nonaktifkan' }).click();

  await page.getByRole('button', { name: 'Nonaktif', exact: true }).click();
  await expect(page.getByText(name)).toBeVisible();

  await page.getByText(name).click();
  await page.getByRole('button', { name: 'Aktifkan' }).click();

  await page.getByRole('button', { name: 'Aktif', exact: true }).click();
  await expect(page.getByText(name)).toBeVisible();
}

async function runProdukLifecycle(page) {
  const suffix = Date.now().toString().slice(-6);
  const code = `PRD-${suffix}`;
  const name = `Produk Agent Test ${suffix}`;

  await page.goto('/master-data/produk');
  await expect(page.getByRole('heading', { name: 'Produk / Jasa' })).toBeVisible();

  await page.getByRole('button', { name: 'Tambah Produk/Jasa' }).click();
  await expect(page.getByRole('heading', { name: 'Tambah Produk/Jasa' })).toBeVisible();

  await page.getByLabel('Kode').fill(code);
  await page.getByLabel('Nama').fill(name);
  await page.getByLabel('Tipe').selectOption('Produk');
  await page.getByLabel('Satuan').fill('Pcs');
  await page.getByLabel('Harga Jual').fill('250000');
  await page.getByLabel('Akun Pendapatan').fill('4-1000');
  await page.getByLabel('Catatan').fill('Dibuat oleh Playwright AI test agent untuk Produk/Jasa.');
  await page.getByRole('button', { name: 'Simpan' }).click();

  await expect(page.getByText(name)).toBeVisible();
  await expect(page.getByText(code)).toBeVisible();
  await expect(page.getByText(/Rp\s*250\.000/)).toBeVisible();

  await page.getByText(name).click();
  await expect(page.getByRole('heading', { name: 'Edit Produk/Jasa' })).toBeVisible();
  await page.getByLabel('Harga Jual').fill('325000');
  await page.getByRole('button', { name: 'Simpan' }).click();

  await expect(page.getByText(/Rp\s*325\.000/)).toBeVisible();

  await page.getByText(name).click();
  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain(name);
    await dialog.accept();
  });
  await page.getByRole('button', { name: 'Nonaktifkan' }).click();

  await page.getByRole('button', { name: 'Nonaktif', exact: true }).click();
  await expect(page.getByText(name)).toBeVisible();

  await page.getByText(name).click();
  await page.getByRole('button', { name: 'Aktifkan' }).click();

  await page.getByRole('button', { name: 'Aktif', exact: true }).click();
  await expect(page.getByText(name)).toBeVisible();
}

async function runCOAFormLifecycle(page) {
  const suffix = Date.now().toString().slice(-4);
  const code = `1-${suffix}`;
  const name = `Akun Agent Test ${suffix}`;
  const updatedName = `${name} Updated`;

  await page.goto('/accounting/coa');
  await expect(page.getByRole('heading', { name: 'Chart of Accounts' })).toBeVisible();

  await page.getByRole('button', { name: 'Tambah Akun' }).click();
  await expect(page.getByRole('heading', { name: 'Tambah Akun' })).toBeVisible();

  await page.getByLabel('Kode').fill(code);
  await page.getByLabel('Nama Akun').fill(name);
  await page.getByLabel('Tipe Akun').selectOption('Asset');
  await page.getByLabel('Saldo Normal').selectOption('Debit');
  await page.getByLabel('Catatan').fill('Dibuat oleh Playwright AI test agent untuk COA.');
  await page.getByRole('button', { name: 'Simpan' }).click();

  await expect(page.getByText(code)).toBeVisible();
  await expect(page.getByText(name)).toBeVisible();

  await page.getByText(name).click();
  await expect(page.getByRole('heading', { name: 'Edit Akun' })).toBeVisible();
  await page.getByLabel('Nama Akun').fill(updatedName);
  await page.getByRole('button', { name: 'Simpan' }).click();

  await expect(page.getByText(updatedName)).toBeVisible();

  await page.getByText(updatedName).click();
  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain(updatedName);
    await dialog.accept();
  });
  await page.getByRole('button', { name: 'Nonaktifkan' }).click();

  await page.getByRole('button', { name: 'Nonaktif', exact: true }).click();
  await expect(page.getByText(updatedName)).toBeVisible();

  await page.getByText(updatedName).click();
  await page.getByRole('button', { name: 'Aktifkan' }).click();

  await page.getByRole('button', { name: 'Aktif', exact: true }).click();
  await expect(page.getByText(updatedName)).toBeVisible();
}

async function runSatuanLifecycle(page) {
  const suffix = Date.now().toString().slice(-6);
  const code = `SAT-${suffix}`;
  const name = `Satuan Agent Test ${suffix}`;
  const updatedSymbol = `u${suffix}`;

  await page.goto('/master-data/satuan');
  await expect(page.getByRole('heading', { name: 'Satuan' })).toBeVisible();

  await page.getByRole('button', { name: 'Tambah Satuan' }).click();
  await expect(page.getByRole('heading', { name: 'Tambah Satuan' })).toBeVisible();

  await page.getByLabel('Kode').fill(code);
  await page.getByLabel('Nama').fill(name);
  await page.getByLabel('Simbol').fill('unit');
  await page.getByLabel('Catatan').fill('Dibuat oleh Playwright AI test agent untuk Satuan.');
  await page.getByRole('button', { name: 'Simpan' }).click();

  await expect(page.getByText(code)).toBeVisible();
  await expect(page.getByText(name)).toBeVisible();

  await page.getByText(name).click();
  await expect(page.getByRole('heading', { name: 'Edit Satuan' })).toBeVisible();
  await page.getByLabel('Simbol').fill(updatedSymbol);
  await page.getByRole('button', { name: 'Simpan' }).click();

  await expect(page.getByText(updatedSymbol)).toBeVisible();

  await page.getByText(name).click();
  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain(name);
    await dialog.accept();
  });
  await page.getByRole('button', { name: 'Nonaktifkan' }).click();

  await page.getByRole('button', { name: 'Nonaktif', exact: true }).click();
  await expect(page.getByText(name)).toBeVisible();

  await page.getByText(name).click();
  await page.getByRole('button', { name: 'Aktifkan' }).click();

  await page.getByRole('button', { name: 'Aktif', exact: true }).click();
  await expect(page.getByText(name)).toBeVisible();
}

async function runKategoriProdukLifecycle(page) {
  const suffix = Date.now().toString().slice(-6);
  const code = `CAT-${suffix}`;
  const name = `Kategori Agent Test ${suffix}`;
  const updatedDescription = `Kategori diperbarui ${suffix}`;

  await page.goto('/master-data/kategori-produk');
  await expect(page.getByRole('heading', { name: 'Kategori Produk' })).toBeVisible();

  await page.getByRole('button', { name: 'Tambah Kategori' }).click();
  await expect(page.getByRole('heading', { name: 'Tambah Kategori Produk' })).toBeVisible();

  await page.getByLabel('Kode').fill(code);
  await page.getByLabel('Nama').fill(name);
  await page.getByLabel('Deskripsi').fill('Kategori dibuat oleh Playwright AI test agent.');
  await page.getByLabel('Catatan').fill('Catatan internal kategori.');
  await page.getByRole('button', { name: 'Simpan' }).click();

  await expect(page.getByText(code)).toBeVisible();
  await expect(page.getByText(name)).toBeVisible();

  await page.getByText(name).click();
  await expect(page.getByRole('heading', { name: 'Edit Kategori Produk' })).toBeVisible();
  await page.getByLabel('Deskripsi').fill(updatedDescription);
  await page.getByRole('button', { name: 'Simpan' }).click();

  await expect(page.getByText(updatedDescription)).toBeVisible();

  await page.getByText(name).click();
  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain(name);
    await dialog.accept();
  });
  await page.getByRole('button', { name: 'Nonaktifkan' }).click();

  await page.getByRole('button', { name: 'Nonaktif', exact: true }).click();
  await expect(page.getByText(name)).toBeVisible();

  await page.getByText(name).click();
  await page.getByRole('button', { name: 'Aktifkan' }).click();

  await page.getByRole('button', { name: 'Aktif', exact: true }).click();
  await expect(page.getByText(name)).toBeVisible();
}

async function runCostCenterLifecycle(page) {
  const suffix = Date.now().toString().slice(-6);
  const code = `CC-${suffix}`;
  const name = `Cost Center Agent Test ${suffix}`;
  const updatedNote = `Cost center diperbarui ${suffix}`;

  await page.goto('/master-data/cost-center');
  await expect(page.getByRole('heading', { name: 'Cost Center' })).toBeVisible();

  await page.getByRole('button', { name: 'Tambah Cost Center' }).click();
  await expect(page.getByRole('heading', { name: 'Tambah Cost Center' })).toBeVisible();

  await page.getByLabel('Kode').fill(code);
  await page.getByLabel('Nama').fill(name);
  await page.getByLabel('Catatan').fill('Dibuat oleh Playwright AI test agent untuk Cost Center.');
  await page.getByRole('button', { name: 'Simpan' }).click();

  await expect(page.getByText(code)).toBeVisible();
  await expect(page.getByText(name)).toBeVisible();

  await page.getByText(name).click();
  await expect(page.getByRole('heading', { name: 'Edit Cost Center' })).toBeVisible();
  await page.getByLabel('Catatan').fill(updatedNote);
  await page.getByRole('button', { name: 'Simpan' }).click();

  await expect(page.getByText(updatedNote)).toBeVisible();

  await page.getByText(name).click();
  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain(name);
    await dialog.accept();
  });
  await page.getByRole('button', { name: 'Nonaktifkan' }).click();

  await page.getByRole('button', { name: 'Nonaktif', exact: true }).click();
  await expect(page.getByText(name)).toBeVisible();

  await page.getByText(name).click();
  await page.getByRole('button', { name: 'Aktifkan' }).click();

  await page.getByRole('button', { name: 'Aktif', exact: true }).click();
  await expect(page.getByText(name)).toBeVisible();
}

async function runJournalDraftLifecycle(page) {
  const suffix = Date.now().toString().slice(-6);
  const description = `Jurnal Agent Test ${suffix}`;

  await page.goto('/accounting');
  await expect(page.getByRole('heading', { name: 'Accounting' })).toBeVisible();

  await page.getByRole('button', { name: 'Buat Jurnal' }).click();
  await expect(page.getByRole('heading', { name: 'Buat Jurnal Draft' })).toBeVisible();
  await expect(page.locator('aside').getByRole('status')).toContainText('Jurnal seimbang.');

  await page.getByLabel('Keterangan Jurnal').fill(description);
  await page.getByLabel('Akun Baris 1').selectOption({ label: '1-1000 - Kas' });
  await page.getByLabel('Debit Baris 1').fill('1500000');
  await page.getByLabel('Deskripsi Baris 1').fill('Kas masuk draft agent');
  await page.getByLabel('Cost Center Baris 1').selectOption({ label: 'CC-001 - Operasional' });
  await page.getByLabel('Akun Baris 2').selectOption({ label: '3-1000 - Modal' });
  await page.getByLabel('Kredit Baris 2').fill('1500000');
  await page.getByLabel('Deskripsi Baris 2').fill('Modal draft agent');
  await page.getByLabel('Cost Center Baris 2').selectOption({ label: 'CC-002 - Administrasi' });
  await page.getByRole('button', { name: 'Simpan Draft' }).click();

  await expect(page.getByText(description)).toBeVisible();
  await expect(page.getByText(/Rp\s*1\.500\.000/)).toHaveCount(2);

  await page.reload();
  await expect(page.getByText(description)).toBeVisible();
}

async function createBalancedDraftJournal(page, description, amount = '1500000') {
  await page.goto('/accounting');
  await expect(page.getByRole('heading', { name: 'Accounting' })).toBeVisible();

  await page.getByRole('button', { name: 'Buat Jurnal' }).click();
  await expect(page.getByRole('heading', { name: 'Buat Jurnal Draft' })).toBeVisible();
  await page.getByLabel('Keterangan Jurnal').fill(description);
  await page.getByLabel('Akun Baris 1').selectOption({ label: '1-1000 - Kas' });
  await page.getByLabel('Debit Baris 1').fill(amount);
  await page.getByLabel('Deskripsi Baris 1').fill('Kas masuk draft agent');
  await page.getByLabel('Cost Center Baris 1').selectOption({ label: 'CC-001 - Operasional' });
  await page.getByLabel('Akun Baris 2').selectOption({ label: '3-1000 - Modal' });
  await page.getByLabel('Kredit Baris 2').fill(amount);
  await page.getByLabel('Deskripsi Baris 2').fill('Modal draft agent');
  await page.getByLabel('Cost Center Baris 2').selectOption({ label: 'CC-002 - Administrasi' });
  await page.getByRole('button', { name: 'Simpan Draft' }).click();
  await expect(page.getByText(description)).toBeVisible();
}

async function createDraftJournalWithAccounts(page, { description, amount, debitAccount, creditAccount, debitDescription, creditDescription }) {
  await page.goto('/accounting');
  await expect(page.getByRole('heading', { name: 'Accounting' })).toBeVisible();

  await page.getByRole('button', { name: 'Buat Jurnal' }).click();
  await expect(page.getByRole('heading', { name: 'Buat Jurnal Draft' })).toBeVisible();
  await page.getByLabel('Keterangan Jurnal').fill(description);
  await page.getByLabel('Akun Baris 1').selectOption({ label: debitAccount });
  await page.getByLabel('Debit Baris 1').fill(amount);
  await page.getByLabel('Deskripsi Baris 1').fill(debitDescription);
  await page.getByLabel('Cost Center Baris 1').selectOption({ label: 'CC-001 - Operasional' });
  await page.getByLabel('Akun Baris 2').selectOption({ label: creditAccount });
  await page.getByLabel('Kredit Baris 2').fill(amount);
  await page.getByLabel('Deskripsi Baris 2').fill(creditDescription);
  await page.getByLabel('Cost Center Baris 2').selectOption({ label: 'CC-002 - Administrasi' });
  await page.getByRole('button', { name: 'Simpan Draft' }).click();
  await expect(page.getByText(description)).toBeVisible();
}

async function postJournalByDescription(page, description) {
  await page.getByText(description).click();
  await expect(page.getByRole('heading', { name: /JV-DRAFT-/ })).toBeVisible();

  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain(description);
    await dialog.accept();
  });
  await page.getByRole('button', { name: 'Post Journal' }).click();

  await expect(page.getByRole('row').filter({ hasText: description })).toContainText('Posted');
}

async function voidJournalByDescription(page, description) {
  await page.getByRole('row').filter({ hasText: description }).click();
  await expect(page.getByRole('button', { name: 'Void Journal' })).toBeVisible();

  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain(description);
    await dialog.accept();
  });
  await page.getByRole('button', { name: 'Void Journal' }).click();

  await expect(page.getByRole('row').filter({ hasText: description }).filter({ hasText: 'Void' }).first()).toBeVisible();
  await expect(page.getByText(`Reversal: ${description}`)).toBeVisible();
}

test.describe('AI ERP Test Agent', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => window.localStorage.clear());
  });

  test('mengecek navigasi utama ERP', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Demo Company' })).toBeVisible();

    await page.getByRole('link', { name: /Master Data/ }).click();
    await expect(page.getByRole('heading', { name: 'Master Data' })).toBeVisible();
    await expect(page.getByText('Pelanggan')).toBeVisible();

    await page.getByRole('link', { name: /Accounting/ }).click();
    await expect(page.getByRole('heading', { name: 'Accounting' })).toBeVisible();

    await page.getByRole('link', { name: /Kas & Bank/ }).click();
    await expect(page.getByRole('heading', { name: 'Kas & Bank' })).toBeVisible();

    await page.getByRole('link', { name: /Laporan/ }).click();
    await expect(page.getByRole('heading', { name: 'Laporan', exact: true })).toBeVisible();
  });

  test('menjalankan lifecycle CRUD Pelanggan', async ({ page }) => {
    await runContactLifecycle(page, {
      path: '/master-data/pelanggan',
      title: 'Pelanggan',
      addButton: 'Tambah Pelanggan',
      addHeading: 'Tambah Pelanggan',
      editHeading: 'Edit Pelanggan',
      codePrefix: 'CUST',
      namePrefix: 'PT',
    });
  });

  test('menjalankan lifecycle CRUD Supplier', async ({ page }) => {
    await runContactLifecycle(page, {
      path: '/master-data/supplier',
      title: 'Supplier',
      addButton: 'Tambah Supplier',
      addHeading: 'Tambah Supplier',
      editHeading: 'Edit Supplier',
      codePrefix: 'SUP',
      namePrefix: 'CV Supplier',
    });
  });

  test('menjalankan lifecycle CRUD Produk/Jasa', async ({ page }) => {
    await runProdukLifecycle(page);
  });

  test('menjalankan lifecycle CRUD Satuan', async ({ page }) => {
    await runSatuanLifecycle(page);
  });

  test('menjalankan lifecycle CRUD Kategori Produk', async ({ page }) => {
    await runKategoriProdukLifecycle(page);
  });

  test('menjalankan lifecycle CRUD Cost Center', async ({ page }) => {
    await runCostCenterLifecycle(page);
  });

  test('menjalankan lifecycle form Chart of Accounts', async ({ page }) => {
    await runCOAFormLifecycle(page);
  });

  test('menyimpan Journal Entry draft dari COA aktif', async ({ page }) => {
    await runJournalDraftLifecycle(page);
  });

  test('posting Journal Entry draft dan mengunci jurnal', async ({ page }) => {
    const description = `Post Journal Agent Test ${Date.now().toString().slice(-6)}`;
    await createBalancedDraftJournal(page, description, '1750000');
    await postJournalByDescription(page, description);
    await page.getByText(description).click();
    await expect(page.getByRole('button', { name: 'Jurnal Terkunci' })).toBeVisible();
  });

  test('menampilkan posted journal di Buku Besar', async ({ page }) => {
    const description = `Ledger Agent Test ${Date.now().toString().slice(-6)}`;
    const today = new Date().toISOString().slice(0, 10);
    await createBalancedDraftJournal(page, description, '2250000');
    await postJournalByDescription(page, description);

    await page.goto('/reports/buku-besar');
    await expect(page.getByRole('heading', { name: 'Buku Besar' })).toBeVisible();
    await page.getByLabel('Dari Tanggal').fill(today);
    await page.getByLabel('Sampai Tanggal').fill(today);
    await page.getByPlaceholder('Cari akun, nomor jurnal, keterangan, atau cost center').fill(description);
    await expect(page.getByText(description).first()).toBeVisible();
    await expect(page.getByRole('row').filter({ hasText: description })).toHaveCount(2);
    await expect(page.getByRole('row').filter({ hasText: '1-1000 - Kas' }).filter({ hasText: 'Debit' }).first()).toBeVisible();
    await expect(page.getByRole('row').filter({ hasText: '3-1000 - Modal' }).filter({ hasText: 'Credit' }).first()).toBeVisible();
    await expect(page.getByText(/Rp\s*2\.250\.000/).first()).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Excel' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain('buku-besar');
  });

  test('membuat Void/Reversal Journal untuk jurnal posted', async ({ page }) => {
    const description = `Void Journal Agent Test ${Date.now().toString().slice(-6)}`;
    await createBalancedDraftJournal(page, description, '1950000');
    await postJournalByDescription(page, description);
    await voidJournalByDescription(page, description);
  });

  test('menampilkan Neraca Saldo dari posted journal', async ({ page }) => {
    const description = `Trial Balance Agent Test ${Date.now().toString().slice(-6)}`;
    const today = new Date().toISOString().slice(0, 10);
    await createBalancedDraftJournal(page, description, '2750000');
    await postJournalByDescription(page, description);

    await page.goto('/reports/neraca-saldo');
    await expect(page.getByRole('heading', { name: 'Neraca Saldo' })).toBeVisible();
    await expect(page.getByText('Balance')).toBeVisible();
    await page.getByLabel('Dari Tanggal').fill(today);
    await page.getByLabel('Sampai Tanggal').fill(today);
    await page.getByPlaceholder('Cari kode akun, nama akun, tipe, atau saldo normal').fill('Kas');
    await expect(page.getByRole('row').filter({ hasText: '1-1000 - Kas' }).filter({ hasText: 'Debit' }).first()).toBeVisible();
    await expect(page.getByText(/Rp\s*2\.750\.000/).first()).toBeVisible();

    await page.getByPlaceholder('Cari kode akun, nama akun, tipe, atau saldo normal').fill('Modal');
    await expect(page.getByRole('row').filter({ hasText: '3-1000 - Modal' }).filter({ hasText: 'Credit' }).first()).toBeVisible();
  });

  test('menampilkan mutasi Kas & Bank dari jurnal posted', async ({ page }) => {
    const description = `Kas Bank Agent Test ${Date.now().toString().slice(-6)}`;
    const today = new Date().toISOString().slice(0, 10);
    await createBalancedDraftJournal(page, description, '1850000');
    await postJournalByDescription(page, description);

    await page.goto('/kas-bank');
    await expect(page.getByRole('heading', { name: 'Kas & Bank' })).toBeVisible();
    await page.getByLabel('Dari Tanggal').fill(today);
    await page.getByLabel('Sampai Tanggal').fill(today);
    await page.getByPlaceholder('Cari akun, nomor jurnal, keterangan, tipe, atau cost center').fill(description);
    await expect(page.getByRole('row').filter({ hasText: description }).filter({ hasText: '1-1000 - Kas' })).toBeVisible();
    await expect(page.getByRole('row').filter({ hasText: description }).filter({ hasText: 'Masuk' })).toBeVisible();
    await expect(page.getByText(/Rp\s*1\.850\.000/).first()).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Excel' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain('kas-bank');
  });

  test('posting transaksi Kas & Bank draft menjadi jurnal otomatis', async ({ page }) => {
    const suffix = Date.now().toString().slice(-6);
    const description = `Kas Bank Draft Agent Test ${suffix}`;
    const today = new Date().toISOString().slice(0, 10);

    await page.goto('/kas-bank');
    await expect(page.getByRole('heading', { name: 'Kas & Bank' })).toBeVisible();
    await page.getByRole('button', { name: 'Tambah Transaksi' }).click();
    await expect(page.getByRole('heading', { name: 'Tambah Transaksi Kas/Bank' })).toBeVisible();
    await page.getByLabel('Tanggal Transaksi').fill(today);
    await page.getByLabel('Tipe Transaksi').selectOption('Masuk');
    await page.getByLabel('Akun Kas/Bank').selectOption({ label: '1-1000 - Kas' });
    await page.getByLabel('Akun Lawan').selectOption({ label: '3-1000 - Modal' });
    await page.getByLabel('Nominal').fill('1650000');
    await page.getByLabel('Cost Center').selectOption({ label: 'CC-001 - Operasional' });
    await page.getByLabel('Keterangan Transaksi').fill(description);
    await page.getByRole('button', { name: 'Simpan Draft' }).click();

    await expect(page.getByRole('row').filter({ hasText: description }).filter({ hasText: 'Draft' })).toBeVisible();
    await page.getByRole('row').filter({ hasText: description }).click();

    page.once('dialog', async (dialog) => {
      expect(dialog.message()).toContain(description);
      await dialog.accept();
    });
    await page.getByRole('button', { name: 'Post Transaksi' }).click();

    await expect(page.getByRole('row').filter({ hasText: description }).filter({ hasText: 'Posted' })).toBeVisible();
    await page.getByLabel('Dari Tanggal').fill(today);
    await page.getByLabel('Sampai Tanggal').fill(today);
    await page.getByPlaceholder('Cari akun, nomor jurnal, keterangan, tipe, atau cost center').fill(description);
    await expect(page.getByRole('row').filter({ hasText: description }).filter({ hasText: 'Masuk' })).toBeVisible();
    await expect(page.getByText(/Rp\s*1\.650\.000/).first()).toBeVisible();
  });

  test('menampilkan Laba Rugi dari jurnal pendapatan posted', async ({ page }) => {
    const description = `Revenue Agent Test ${Date.now().toString().slice(-6)}`;
    const today = new Date().toISOString().slice(0, 10);
    await createDraftJournalWithAccounts(page, {
      description,
      amount: '2450000',
      debitAccount: '1-1000 - Kas',
      creditAccount: '4-1000 - Pendapatan',
      debitDescription: 'Kas pendapatan agent',
      creditDescription: 'Pendapatan agent',
    });
    await postJournalByDescription(page, description);

    await page.goto('/reports/laba-rugi');
    await expect(page.getByRole('heading', { name: 'Laba Rugi' })).toBeVisible();
    await page.getByLabel('Dari Tanggal').fill(today);
    await page.getByLabel('Sampai Tanggal').fill(today);
    await page.getByPlaceholder('Cari kode akun, nama akun, atau tipe').fill('Pendapatan');
    await expect(page.getByRole('row').filter({ hasText: '4-1000 - Pendapatan' }).filter({ hasText: 'Revenue' })).toBeVisible();
    await expect(page.getByText(/Rp\s*2\.450\.000/).first()).toBeVisible();
  });

  test('menampilkan Neraca balance termasuk laba berjalan', async ({ page }) => {
    const description = `Balance Sheet Agent Test ${Date.now().toString().slice(-6)}`;
    const today = new Date().toISOString().slice(0, 10);
    await createDraftJournalWithAccounts(page, {
      description,
      amount: '3150000',
      debitAccount: '1-1000 - Kas',
      creditAccount: '4-1000 - Pendapatan',
      debitDescription: 'Kas neraca agent',
      creditDescription: 'Pendapatan neraca agent',
    });
    await postJournalByDescription(page, description);

    await page.goto('/reports/neraca');
    await expect(page.getByRole('heading', { name: 'Neraca' })).toBeVisible();
    await expect(page.getByText('Balance')).toBeVisible();
    await page.getByLabel('Dari Tanggal').fill(today);
    await page.getByLabel('Sampai Tanggal').fill(today);
    await page.getByPlaceholder('Cari kode akun, nama akun, tipe, atau saldo normal').fill('Laba/Rugi Berjalan');
    await expect(page.getByRole('row').filter({ hasText: '3-9999 - Laba/Rugi Berjalan' })).toBeVisible();
    await expect(page.getByText(/Rp\s*3\.150\.000/).first()).toBeVisible();
  });

  test('menjaga validasi debit dan kredit jurnal draft', async ({ page }) => {
    await page.goto('/accounting');

    await expect(page.getByRole('heading', { name: 'Validasi Jurnal Draft' })).toBeVisible();
    await expect(page.getByRole('status')).toContainText('Jurnal seimbang.');
    await expect(page.getByText('Seimbang', { exact: true })).toBeVisible();

    await page.getByLabel('Kredit Modal').fill('900000');

    await expect(page.getByRole('status')).toContainText('Total debit dan kredit harus seimbang.');
    await expect(page.getByText('Tidak seimbang', { exact: true })).toBeVisible();

    await page.getByLabel('Kredit Modal').fill('1000000');

    await expect(page.getByRole('status')).toContainText('Jurnal seimbang.');
  });

  test('merekam visual snapshot shell iOS ERP', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    await expect(page).toHaveScreenshot('dashboard-ios-shell.png', {
      animations: 'disabled',
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });

    await page.goto('/master-data');
    await expect(page.getByRole('heading', { name: 'Master Data' })).toBeVisible();
    await expect(page).toHaveScreenshot('master-data-ios-shell.png', {
      animations: 'disabled',
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  });
});
