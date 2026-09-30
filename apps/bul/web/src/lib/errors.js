const PESAN = {
  '42501': () => 'Anda tidak punya akses untuk aksi ini.',
  P0001: (e) => e.message,
  P0002: () => 'Data tidak ditemukan. Muat ulang halaman.',
  '23505': () => 'Data dengan nomor/kode yang sama sudah ada.',
  '23514': (e) => `Data ditolak pemeriksaan: ${e.message}`,
  '23503': () => 'Data masih dipakai atau rujukannya tidak ada.',
  '22P02': () => 'Format isian tidak valid.',
};

export function pesanError(err) {
  if (!err) return 'Terjadi kesalahan.';
  if (err.code && PESAN[err.code]) return PESAN[err.code](err);
  if (/Failed to fetch|NetworkError/i.test(err.message ?? '')) {
    return 'Tidak bisa terhubung ke server. Periksa koneksi internet.';
  }
  return err.message || 'Terjadi kesalahan.';
}
