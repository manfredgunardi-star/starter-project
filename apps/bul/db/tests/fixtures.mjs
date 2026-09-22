import { sebagai, unik } from './helpers.mjs';

const satu = async (uid, q, p) => (await sebagai(uid, q, p))[0];

/**
 * Membuat satu set master lengkap untuk satu lini.
 * Semua nilai uang dikirim sebagai string agar tidak melewati float.
 */
export async function siapkanMaster(owner, opsi = {}) {
  const {
    lini = 'SJP',
    tanggal = '2026-01-01',
    harga = '63000',
    uangJalan = '400000',
    upah = '150000',
    basis = 'per_sj',
  } = opsi;
  const { id: pelanggan } = await satu(owner, 'select public.simpan_pelanggan(p_id => null, p_nama => $1) as id', [unik('PLG-')]);
  const { id: rute } = await satu(owner, 'select public.simpan_rute(p_id => null, p_nama => $1, p_asal => $2, p_tujuan => $3) as id', [unik('RUTE-'), 'Pasir JB', 'Bogor']);
  await sebagai(owner, 'select public.simpan_uang_jalan_rute($1, $2, $3)', [rute, tanggal, uangJalan]);
  const { id: material } = await satu(owner, 'select public.simpan_material(p_id => null, p_lini_kode => $1, p_nama => $2, p_satuan => $3) as id', [lini, unik('MAT-'), 'm3']);
  const { id: truk } = await satu(owner, 'select public.simpan_truk(p_id => null, p_nopol => $1, p_jenis => $2) as id', [unik('B '), 'Dump']);
  const { id: supir } = await satu(owner, 'select public.simpan_supir(p_id => null, p_nama => $1) as id', [unik('SUPIR-')]);
  await sebagai(owner, 'select public.simpan_tarif($1, $2, $3, $4, $5)', [pelanggan, rute, material, tanggal, harga]);
  await sebagai(owner,
    'select public.simpan_aturan_upah(p_id => null, p_nama => $1, p_rute_id => $2, p_material_id => null, p_berlaku_mulai => $3, p_basis => $4, p_nominal => $5)',
    [unik('UPAH-'), rute, tanggal, basis, upah]);
  return { lini, pelanggan, rute, material, truk, supir };
}

export async function buatSj(uid, m, opsi = {}) {
  const { nomor = unik('SJ'), tanggal = '2026-02-02', qty = '10', uangJalan = null } = opsi;
  const [r] = await sebagai(uid,
    `select public.buat_sj(p_lini_kode => $1, p_nomor => $2, p_tanggal => $3, p_pelanggan_id => $4, p_rute_id => $5,
       p_material_id => $6, p_truk_id => $7, p_supir_id => $8, p_qty_muat => $9, p_uang_jalan => $10) as id`,
    [m.lini, nomor, tanggal, m.pelanggan, m.rute, m.material, m.truk, m.supir, qty, uangJalan]);
  return r.id;
}

export async function buatSjSelesai(uid, m, opsi = {}) {
  const { qtyBongkar = opsi.qty ?? '10', tanggalSelesai = opsi.tanggal ?? '2026-02-02', upah = null } = opsi;
  const id = await buatSj(uid, m, opsi);
  await sebagai(uid, 'select public.selesaikan_sj($1, $2, $3, $4)', [id, qtyBongkar, tanggalSelesai, upah]);
  return id;
}
