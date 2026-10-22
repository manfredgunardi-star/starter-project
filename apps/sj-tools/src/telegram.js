// Kirim file ke Telegram lewat Bot API sendDocument. Tidak bentrok dengan polling getUpdates Hermes.
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// Error jaringan (mis. ECONNRESET, pernah terjadi di VPS 2026-10-22) dicoba ulang SEKALI.
// Error HTTP dari Telegram tidak diulang: request sudah sampai, mengulang berisiko file ganda.
const ATTEMPTS = 2;

export const sendDocument = async (buffer, filename, caption, {
  token = process.env.TELEGRAM_BOT_TOKEN,
  chatId = process.env.TELEGRAM_CHAT_ID,
  fetchImpl = fetch,
  retryDelayMs = 3000,
} = {}) => {
  if (!token || !chatId) throw new Error('Variabel .env belum diisi: TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID');

  let res;
  for (let attempt = 1; !res; attempt++) {
    const form = new FormData();
    form.append('chat_id', chatId);
    form.append('caption', caption);
    form.append('document', new Blob([buffer], { type: XLSX_MIME }), filename);
    try {
      res = await fetchImpl(`https://api.telegram.org/bot${token}/sendDocument`, {
        method: 'POST', body: form, signal: AbortSignal.timeout(60_000),
      });
    } catch (err) {
      if (attempt < ATTEMPTS) { await new Promise((r) => setTimeout(r, retryDelayMs)); continue; }
      // Jangan teruskan err.message mentah: bisa memuat URL yang berisi token.
      throw new Error(`Gagal menghubungi Telegram setelah ${ATTEMPTS}x (${err.name}${err.cause?.code ? `/${err.cause.code}` : ''})`);
    }
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) {
    throw new Error(`Telegram menolak sendDocument (HTTP ${res.status}): ${body.description || 'tanpa keterangan'}`);
  }
};
