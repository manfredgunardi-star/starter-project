export const DB_URL =
  process.env.BUL_TEST_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

const HOST_LOKAL = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

export function pastikanLokal(url) {
  const host = new URL(url).hostname;
  if (!HOST_LOKAL.has(host)) {
    throw new Error(`Menolak menjalankan terhadap host non-lokal: ${host}`);
  }
}
