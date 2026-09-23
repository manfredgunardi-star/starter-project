import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { resetDb } from '../reset-db.mjs';
import { sql, buatPengguna, sebagai, tutup } from './helpers.mjs';
import { siapkanMaster } from './fixtures.mjs';

let owner, keu, m;

beforeAll(async () => {
  await resetDb();
  owner = await buatPengguna('owner');
  keu = await buatPengguna('keuangan');
  m = await siapkanMaster(owner);
});
afterAll(tutup);

const baris = (piutang = '2500000') => [
  { akun_kode: '1112', debit: '10000000', keterangan: 'Saldo BCA 31-12-2025' },
  { akun_kode: '1121', debit: piutang, pelanggan_id: m.pelanggan },
  { akun_kode: '2121', kredit: '500000', supir_id: m.supir },
  { akun_kode: '3110', kredit: String(10000000 + Number(piutang) - 500000) },
];
const posting = (uid, b = baris()) =>
  sebagai(uid, "select public.posting_saldo_awal('2025-12-31', $1) as id", [JSON.stringify(b)]).then((r) => r[0].id);

describe('saldo awal', () => {
  it('hanya owner; menolak jurnal tidak seimbang', async () => {
    await expect(posting(keu)).rejects.toMatchObject({ code: '42501' });
    const salah = baris();
    salah[0].debit = '9999999';
    await expect(posting(owner, salah)).rejects.toMatchObject({ code: '23514' });
  });

  it('memposting satu jurnal saldo_awal; yang kedua ditolak', async () => {
    const id = await posting(owner);
    const [j] = await sql('select sumber_tipe, tanggal from public.jurnal where id = $1', [id]);
    expect(j).toEqual({ sumber_tipe: 'saldo_awal', tanggal: '2025-12-31' });
    await expect(posting(owner)).rejects.toMatchObject({ code: 'P0001' });
  });

  it('piutang saldo awal per invoice dan pengecekan selisih', async () => {
    const buat = (nomor, jumlah) => sebagai(owner,
      "select public.buat_piutang_saldo_awal($1, 'SJP', $2, '2025-12-20', $3) as id", [nomor, m.pelanggan, jumlah]).then((r) => r[0].id);
    await buat('SJP/090/12/2025', '1500000');
    let [c] = await sebagai(keu, 'select * from public.cek_saldo_awal_piutang()');
    expect(c).toEqual({ saldo_gl: '2500000.00', total_invoice: '1500000.00', selisih: '1000000.00' });
    const id2 = await buat('SJP/091/12/2025', '1000000');
    [c] = await sebagai(keu, 'select * from public.cek_saldo_awal_piutang()');
    expect(c.selisih).toBe('0.00');
    const [inv] = await sql('select saldo_awal, jurnal_id, total_akhir from public.invoice where id = $1', [id2]);
    expect(inv).toEqual({ saldo_awal: true, jurnal_id: null, total_akhir: '1000000.00' });
  });

  it('piutang saldo awal bisa dilunasi lewat pembayaran biasa', async () => {
    const [inv] = await sql("select id from public.invoice where nomor = 'SJP/091/12/2025'");
    await sebagai(keu, "select public.catat_pembayaran('2026-01-10', $1, '1112', '995000', '5000', $2)", [
      m.pelanggan, JSON.stringify([{ invoice_id: inv.id, jumlah: '1000000' }]),
    ]);
    const [s] = await sql('select sisa from public.v_invoice_saldo where id = $1', [inv.id]);
    expect(s.sisa).toBe('0.00');
  });

  it('tanggal piutang saldo awal tidak boleh setelah tanggal saldo awal', async () => {
    await expect(sebagai(owner,
      "select public.buat_piutang_saldo_awal('SJP/X/01/2026', 'SJP', $1, '2026-01-05', '1')", [m.pelanggan])).rejects.toMatchObject({ code: 'P0001' });
  });

  it('batal saldo awal lalu posting ulang', async () => {
    await sebagai(owner, "select public.batalkan_saldo_awal('angka akuntan direvisi')");
    await expect(posting(owner)).resolves.toBeTruthy();
  });
});
