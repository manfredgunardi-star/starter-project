import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { resetDb } from '../reset-db.mjs';
import { sql, buatPengguna, sebagai, tutup } from './helpers.mjs';
import { siapkanMaster } from './fixtures.mjs';

let owner, keu, ops, m;

beforeAll(async () => {
  await resetDb();
  owner = await buatPengguna('owner');
  keu = await buatPengguna('keuangan');
  ops = await buatPengguna('operasional');
  m = await siapkanMaster(owner);
});
afterAll(tutup);

const kas = (uid, jenis, baris, { tanggal = '2026-02-15', akun = '1112', ket = 'Uji kas' } = {}) =>
  sebagai(uid, 'select public.catat_kas($1, $2, $3, $4, $5) as id', [jenis, tanggal, akun, ket, JSON.stringify(baris)]).then((r) => r[0].id);

const barisJurnal = async (id) => {
  const [t] = await sql('select jurnal_id from public.transaksi_kas where id = $1', [id]);
  return sql('select akun_kode, debit, kredit, truk_id, supir_id from public.jurnal_baris where jurnal_id = $1 order by urutan', [t.jurnal_id]);
};

describe('kas keluar dan masuk', () => {
  it('biaya multi-baris dengan dimensi truk', async () => {
    const id = await kas(keu, 'keluar', [
      { akun_kode: '5220', jumlah: '350000', truk_id: m.truk, keterangan: 'Kampas rem' },
      { akun_kode: '5210', jumlah: '150000', truk_id: m.truk, keterangan: 'Jasa bengkel' },
    ]);
    const [t] = await sql('select nomor, total, jenis from public.transaksi_kas where id = $1', [id]);
    expect(t).toMatchObject({ total: '500000.00', jenis: 'keluar' });
    expect(t.nomor).toMatch(/^KK-2026-\d{6}$/);
    expect(await barisJurnal(id)).toEqual([
      { akun_kode: '5220', debit: '350000.00', kredit: '0.00', truk_id: m.truk, supir_id: null },
      { akun_kode: '5210', debit: '150000.00', kredit: '0.00', truk_id: m.truk, supir_id: null },
      { akun_kode: '1112', debit: '0.00', kredit: '500000.00', truk_id: null, supir_id: null },
    ]);
  });

  it('kas masuk: setoran modal', async () => {
    const id = await kas(owner, 'masuk', [{ akun_kode: '3110', jumlah: '5000000' }]);
    expect(await barisJurnal(id)).toEqual([
      { akun_kode: '3110', debit: '0.00', kredit: '5000000.00', truk_id: null, supir_id: null },
      { akun_kode: '1112', debit: '5000000.00', kredit: '0.00', truk_id: null, supir_id: null },
    ]);
  });

  it('bayar upah supir wajib memilih supir', async () => {
    await expect(kas(keu, 'keluar', [{ akun_kode: '2121', jumlah: '150000' }])).rejects.toMatchObject({ code: 'P0001' });
    const id = await kas(keu, 'keluar', [{ akun_kode: '2121', jumlah: '150000', supir_id: m.supir }]);
    expect((await barisJurnal(id))[0]).toMatchObject({ akun_kode: '2121', debit: '150000.00', supir_id: m.supir });
  });

  it('menolak baris akun kas/bank, piutang, jumlah ≤ 0, jenis tak dikenal, akun sumber bukan kas', async () => {
    await expect(kas(keu, 'keluar', [{ akun_kode: '1111', jumlah: '1' }])).rejects.toMatchObject({ code: 'P0001' });
    await expect(kas(keu, 'masuk', [{ akun_kode: '1121', jumlah: '1' }])).rejects.toMatchObject({ code: 'P0001' });
    await expect(kas(keu, 'keluar', [{ akun_kode: '5110', jumlah: '0' }])).rejects.toMatchObject({ code: 'P0001' });
    await expect(kas(keu, 'transfer', [{ akun_kode: '5110', jumlah: '1' }])).rejects.toMatchObject({ code: 'P0001' });
    await expect(kas(keu, 'keluar', [{ akun_kode: '5110', jumlah: '1' }], { akun: '5110' })).rejects.toMatchObject({ code: 'P0001' });
  });

  it('operasional tidak boleh mencatat kas', async () => {
    await expect(kas(ops, 'keluar', [{ akun_kode: '5110', jumlah: '1' }])).rejects.toMatchObject({ code: '42501' });
  });
});

describe('transfer dan pembatalan', () => {
  it('transfer antar kas/bank', async () => {
    const [{ id }] = await sebagai(keu, "select public.transfer_kas('2026-02-16', '1112', '1111', '2000000', 'Isi kas kecil') as id");
    const [t] = await sql('select nomor, akun_tujuan_kode, total from public.transaksi_kas where id = $1', [id]);
    expect(t.nomor).toMatch(/^TF-2026-\d{6}$/);
    expect(await barisJurnal(id)).toEqual([
      { akun_kode: '1111', debit: '2000000.00', kredit: '0.00', truk_id: null, supir_id: null },
      { akun_kode: '1112', debit: '0.00', kredit: '2000000.00', truk_id: null, supir_id: null },
    ]);
    await expect(sebagai(keu, "select public.transfer_kas('2026-02-16', '1112', '1112', '1', 'x')")).rejects.toMatchObject({ code: 'P0001' });
  });

  it('batal kas membuat jurnal pembalik', async () => {
    const id = await kas(keu, 'keluar', [{ akun_kode: '5110', jumlah: '200000', truk_id: m.truk }]);
    await sebagai(keu, "select public.batalkan_kas($1, 'nota dobel', '2026-02-17')", [id]);
    const [t] = await sql('select status, jurnal_id, jurnal_batal_id from public.transaksi_kas where id = $1', [id]);
    expect(t.status).toBe('batal');
    const [j] = await sql('select dibalik_oleh_id from public.jurnal where id = $1', [t.jurnal_id]);
    expect(j.dibalik_oleh_id).toBe(t.jurnal_batal_id);
    await expect(sebagai(keu, "select public.batalkan_kas($1, 'x', '2026-02-17')", [id])).rejects.toMatchObject({ code: 'P0001' });
  });
});
