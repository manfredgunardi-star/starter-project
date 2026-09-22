import dayjs from 'dayjs';
import { keSen } from './uang.js';

const kelompok = (s) => s.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

export function formatRupiah(v) {
  const sen = keSen(v ?? 0);
  const minus = sen < 0n;
  const abs = minus ? -sen : sen;
  const bulat = kelompok(String(abs / 100n));
  const sisa = abs % 100n;
  const teks = `Rp ${bulat}${sisa ? `,${String(sisa).padStart(2, '0')}` : ''}`;
  return minus ? `-${teks}` : teks;
}

export function formatQty(v) {
  const [bulat, pecahan = ''] = String(v ?? '0').split('.');
  const pecah = pecahan.replace(/0+$/, '');
  return `${kelompok(bulat)}${pecah ? `,${pecah}` : ''}`;
}

export function formatTanggal(v) {
  return v ? dayjs(v).format('DD/MM/YYYY') : '';
}

export function keTanggalDb(d) {
  return d ? dayjs(d).format('YYYY-MM-DD') : null;
}
