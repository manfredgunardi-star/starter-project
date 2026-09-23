import { dariSen, jumlahkan, keSen } from '../../lib/uang.js';

export function selisihJurnal(baris) {
  const d = jumlahkan(baris.map((b) => b?.debit ?? '0'));
  const k = jumlahkan(baris.map((b) => b?.kredit ?? '0'));
  return { debit: dariSen(d), kredit: dariSen(k), selisih: dariSen(d - k) };
}

export function keBarisJurnal(baris) {
  return baris
    .filter((b) => b?.akun_kode && (keSen(b.debit ?? '0') > 0n || keSen(b.kredit ?? '0') > 0n))
    .map((b) => {
      if (keSen(b.debit ?? '0') > 0n && keSen(b.kredit ?? '0') > 0n) {
        throw new Error(`Baris akun ${b.akun_kode} harus diisi debit atau kredit saja`);
      }
      return {
        akun_kode: b.akun_kode, debit: b.debit || '0', kredit: b.kredit || '0', keterangan: b.keterangan ?? '',
        truk_id: b.truk_id ?? null, supir_id: b.supir_id ?? null, pelanggan_id: b.pelanggan_id ?? null, lini_kode: b.lini_kode ?? null,
      };
    });
}
