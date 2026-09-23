import { dariSen, keSen, jumlahkan } from '../../lib/uang.js';

export function alokasiOtomatis(invoices, jumlah) {
  let sisaBayar = keSen(jumlah);
  const hasil = [];
  for (const i of invoices) {
    if (sisaBayar <= 0n) break;
    const sisa = keSen(i.sisa);
    const ambil = sisa < sisaBayar ? sisa : sisaBayar;
    if (ambil > 0n) {
      hasil.push({ invoice_id: i.id, jumlah: dariSen(ambil) });
      sisaBayar -= ambil;
    }
  }
  return hasil;
}

export function cekAlokasi(alokasi, diterima, pph) {
  const isi = alokasi.filter((a) => a.invoice_id);
  if (isi.length === 0) return 'Pilih minimal satu invoice';
  if (isi.some((a) => keSen(a.jumlah) <= 0n)) return 'Jumlah alokasi harus lebih dari 0';
  const total = jumlahkan(isi.map((a) => a.jumlah));
  const bayar = keSen(diterima) + keSen(pph);
  if (total !== bayar) return `Total alokasi ${dariSen(total)} harus sama dengan diterima + PPh ${dariSen(bayar)}`;
  return null;
}
