import { keTanggalDb } from '../../lib/format.js';

const kosongNull = (v) => (v === undefined || v === null || v === '' ? null : v);

export function argsBuatSj(v) {
  return {
    p_lini_kode: v.lini_kode, p_nomor: String(v.nomor).trim(), p_tanggal: keTanggalDb(v.tanggal),
    p_pelanggan_id: v.pelanggan_id, p_rute_id: v.rute_id, p_material_id: v.material_id,
    p_truk_id: v.truk_id, p_supir_id: v.supir_id, p_qty_muat: v.qty_muat,
    p_uang_jalan: kosongNull(v.uang_jalan), p_keterangan: v.keterangan ?? '',
  };
}

export function argsUbahSj(id, v) {
  if (kosongNull(v.uang_jalan) === null) throw new Error('Uang jalan wajib diisi saat mengubah SJ');
  const { p_lini_kode, ...sisa } = argsBuatSj(v); // lini tidak bisa diubah
  return { p_id: id, ...sisa };
}

export function argsSelesai(id, v) {
  return {
    p_id: id, p_qty_bongkar: v.qty_bongkar, p_tanggal_selesai: keTanggalDb(v.tanggal_selesai), p_upah: kosongNull(v.upah),
  };
}
