import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { resetDb } from '../reset-db.mjs';
import { sql, buatPengguna, sebagai, tutup } from './helpers.mjs';
import { siapkanMaster, buatSjSelesai, terbitkan } from './fixtures.mjs';

let owner, ops, keu;

beforeAll(async () => {
  await resetDb();
  owner = await buatPengguna('owner');
  ops = await buatPengguna('operasional');
  keu = await buatPengguna('keuangan');
});
afterAll(tutup);

// Invoice standar: subtotal 1.417.500, UJ 850.000, total akhir 567.500
async function invoiceStandar() {
  const m = await siapkanMaster(owner);
  const sj1 = await buatSjSelesai(ops, m, { qty: '10' });
  const sj2 = await buatSjSelesai(ops, m, { qty: '12.5', uangJalan: '450000' });
  const id = await terbitkan(keu, m, [sj1, sj2]);
  return { m, id };
}

const bayar = (uid, m, alokasi, { tanggal = '2026-02-20', akun = '1112', diterima, pph = '0' } = {}) =>
  sebagai(uid,
    'select public.catat_pembayaran($1, $2, $3, $4, $5, $6) as id',
    [tanggal, m.pelanggan, akun, diterima, pph, JSON.stringify(alokasi)]).then((r) => r[0].id);

const saldo = async (id) => (await sql('select dibayar, sisa from public.v_invoice_saldo where id = $1', [id]))[0];

describe('catat pembayaran', () => {
  it('saran PPh = 0,5% × subtotal bruto, dibulatkan ke rupiah', async () => {
    const { id } = await invoiceStandar();
    const [{ v }] = await sebagai(keu, "select public.saran_pph_invoice($1, '2026-02-20') as v", [id]);
    expect(v).toBe('7088');
  });

  it('pelunasan penuh dengan PPh dipotong: Dr Bank + Dr 6251 / Cr 1121', async () => {
    const { m, id } = await invoiceStandar();
    const bid = await bayar(keu, m, [{ invoice_id: id, jumlah: '567500' }], { diterima: '560412', pph: '7088' });
    const [p] = await sql('select nomor, jurnal_id from public.pembayaran where id = $1', [bid]);
    expect(p.nomor).toMatch(/^BYR-2026-\d{6}$/);
    const baris = await sql('select akun_kode, debit, kredit, pelanggan_id from public.jurnal_baris where jurnal_id = $1 order by urutan', [p.jurnal_id]);
    expect(baris).toEqual([
      { akun_kode: '1112', debit: '560412.00', kredit: '0.00', pelanggan_id: m.pelanggan },
      { akun_kode: '6251', debit: '7088.00', kredit: '0.00', pelanggan_id: m.pelanggan },
      { akun_kode: '1121', debit: '0.00', kredit: '567500.00', pelanggan_id: m.pelanggan },
    ]);
    expect(await saldo(id)).toEqual({ dibayar: '567500.00', sisa: '0.00' });
  });

  it('pembayaran sebagian lalu sisanya', async () => {
    const { m, id } = await invoiceStandar();
    await bayar(keu, m, [{ invoice_id: id, jumlah: '300000' }], { diterima: '300000' });
    expect(await saldo(id)).toEqual({ dibayar: '300000.00', sisa: '267500.00' });
    await bayar(keu, m, [{ invoice_id: id, jumlah: '267500' }], { diterima: '260412', pph: '7088' });
    expect((await saldo(id)).sisa).toBe('0.00');
  });

  it('satu transfer untuk dua invoice', async () => {
    const m = await siapkanMaster(owner);
    const a = await terbitkan(keu, m, [await buatSjSelesai(ops, m, { qty: '10' })]);
    const b = await terbitkan(keu, m, [await buatSjSelesai(ops, m, { qty: '10' })]);
    await bayar(keu, m, [{ invoice_id: a, jumlah: '230000' }, { invoice_id: b, jumlah: '230000' }], { diterima: '460000' });
    expect((await saldo(a)).sisa).toBe('0.00');
    expect((await saldo(b)).sisa).toBe('0.00');
  });

  it('menolak kelebihan bayar, jumlah tidak cocok, pelanggan lain, akun bukan kas, alokasi ganda', async () => {
    const { m, id } = await invoiceStandar();
    await expect(bayar(keu, m, [{ invoice_id: id, jumlah: '567501' }], { diterima: '567501' })).rejects.toMatchObject({ code: 'P0001' });
    await expect(bayar(keu, m, [{ invoice_id: id, jumlah: '500000' }], { diterima: '400000' })).rejects.toMatchObject({ code: 'P0001' });
    const lain = await siapkanMaster(owner);
    await expect(bayar(keu, lain, [{ invoice_id: id, jumlah: '1000' }], { diterima: '1000' })).rejects.toMatchObject({ code: 'P0001' });
    await expect(bayar(keu, m, [{ invoice_id: id, jumlah: '1000' }], { diterima: '1000', akun: '5110' })).rejects.toMatchObject({ code: 'P0001' });
    await expect(bayar(keu, m, [{ invoice_id: id, jumlah: '1000' }, { invoice_id: id, jumlah: '1000' }], { diterima: '2000' })).rejects.toMatchObject({ code: 'P0001' });
  });

  it('operasional tidak boleh mencatat pembayaran', async () => {
    const { m, id } = await invoiceStandar();
    await expect(bayar(ops, m, [{ invoice_id: id, jumlah: '1000' }], { diterima: '1000' })).rejects.toMatchObject({ code: '42501' });
  });
});

describe('pembatalan', () => {
  it('batal pembayaran memulihkan sisa; invoice berpembayaran tidak bisa dibatalkan', async () => {
    const { m, id } = await invoiceStandar();
    const bid = await bayar(keu, m, [{ invoice_id: id, jumlah: '567500' }], { diterima: '567500' });
    await expect(sebagai(keu, "select public.batalkan_invoice($1, 'x', '2026-02-21')", [id])).rejects.toMatchObject({ code: 'P0001' });
    await sebagai(keu, "select public.batalkan_pembayaran($1, 'salah rekening', '2026-02-21')", [bid]);
    expect((await saldo(id)).sisa).toBe('567500.00');
    const [p] = await sql('select status, jurnal_batal_id from public.pembayaran where id = $1', [bid]);
    expect(p.status).toBe('batal');
    expect(p.jurnal_batal_id).not.toBeNull();
    await expect(sebagai(keu, "select public.batalkan_invoice($1, 'x', '2026-02-21')", [id])).resolves.toBeTruthy();
  });
});
