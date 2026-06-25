import { expect, test } from '@playwright/test';

const hasSupabaseStagingEnv = Boolean(
  process.env.VITE_SUPABASE_URL &&
    process.env.VITE_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_E2E_EMAIL &&
    process.env.SUPABASE_E2E_PASSWORD
);

test.describe('Supabase staging ERP flow', () => {
  test.skip(!hasSupabaseStagingEnv, 'Set VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_E2E_EMAIL, and SUPABASE_E2E_PASSWORD to run staging checks.');

  test('login, create draft journal, post, and read ledger from Supabase', async ({ page }) => {
    const suffix = Date.now().toString().slice(-6);
    const description = `Supabase Staging Journal ${suffix}`;
    const today = new Date().toISOString().slice(0, 10);

    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Masuk Mini ERP' })).toBeVisible();
    await page.getByLabel('Email').fill(process.env.SUPABASE_E2E_EMAIL);
    await page.getByLabel('Password').fill(process.env.SUPABASE_E2E_PASSWORD);
    await page.getByRole('button', { name: 'Masuk' }).click();

    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Demo Company/ })).toBeVisible();

    await page.goto('/accounting');
    await expect(page.getByRole('heading', { name: 'Accounting' })).toBeVisible();
    await page.getByRole('button', { name: 'Buat Jurnal' }).click();
    await expect(page.getByRole('heading', { name: 'Buat Jurnal Draft' })).toBeVisible();

    await page.getByLabel('Keterangan Jurnal').fill(description);
    await page.getByLabel('Akun Baris 1').selectOption({ label: '1-1000 - Kas' });
    await page.getByLabel('Debit Baris 1').fill('1234500');
    await page.getByLabel('Deskripsi Baris 1').fill('Kas staging');
    await page.getByLabel('Akun Baris 2').selectOption({ label: '3-1000 - Modal' });
    await page.getByLabel('Kredit Baris 2').fill('1234500');
    await page.getByLabel('Deskripsi Baris 2').fill('Modal staging');
    await page.getByRole('button', { name: 'Simpan Draft' }).click();

    await expect(page.getByRole('row').filter({ hasText: description }).filter({ hasText: 'Draft' })).toBeVisible();
    await page.getByRole('row').filter({ hasText: description }).click();
    await page.getByRole('button', { name: 'Approve Journal' }).click();
    await expect(page.getByRole('button', { name: 'Post Journal' })).toBeEnabled();

    page.once('dialog', async (dialog) => {
      expect(dialog.message()).toContain(description);
      await dialog.accept();
    });
    await page.getByRole('button', { name: 'Post Journal' }).click();
    await expect(page.getByRole('row').filter({ hasText: description }).filter({ hasText: 'Posted' })).toBeVisible();

    await page.goto('/reports/buku-besar');
    await expect(page.getByRole('heading', { name: 'Buku Besar' })).toBeVisible();
    await page.getByLabel('Dari Tanggal').fill(today);
    await page.getByLabel('Sampai Tanggal').fill(today);
    await page.getByPlaceholder('Cari akun, nomor jurnal, keterangan, atau cost center').fill(description);
    await expect(page.getByRole('row').filter({ hasText: description })).toHaveCount(2);
    await expect(page.getByRole('row').filter({ hasText: '1-1000 - Kas' }).filter({ hasText: 'Debit' })).toBeVisible();
    await expect(page.getByRole('row').filter({ hasText: '3-1000 - Modal' }).filter({ hasText: 'Credit' })).toBeVisible();
  });
});
