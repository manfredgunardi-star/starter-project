import { dariSen, jumlahkan } from '../../lib/uang.js';

export function hitungRingkasan(baris) {
  const valid = baris.filter((b) => b.jumlah !== null && b.jumlah !== undefined);
  const subtotal = jumlahkan(valid.map((b) => b.jumlah));
  const uj = jumlahkan(valid.map((b) => b.uang_jalan));
  return { subtotal: dariSen(subtotal), totalUangJalan: dariSen(uj), totalAkhir: dariSen(subtotal - uj) };
}
