import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sendDocument } from '../src/telegram.js';

const TOKEN = '123456789:AAFAKE_TOKEN_UNTUK_TES_SAJA_xxxxxxxxxx';

test('sendDocument mengirim multipart ke chat yang benar', async () => {
  let call;
  const fetchImpl = async (url, opts) => { call = { url, opts }; return new Response(JSON.stringify({ ok: true }), { status: 200 }); };
  await sendDocument(Buffer.from('xlsx'), 'Rekap.xlsx', 'cap', { token: TOKEN, chatId: '42', fetchImpl });
  assert.equal(call.url, `https://api.telegram.org/bot${TOKEN}/sendDocument`);
  assert.equal(call.opts.body.get('chat_id'), '42');
  assert.equal(call.opts.body.get('caption'), 'cap');
  assert.equal(call.opts.body.get('document').name, 'Rekap.xlsx');
});

test('error Telegram tidak membocorkan token', async () => {
  const reject = async () => new Response(JSON.stringify({ ok: false, description: 'Bad Request: chat not found' }), { status: 400 });
  await assert.rejects(sendDocument(Buffer.from('x'), 'a.xlsx', 'c', { token: TOKEN, chatId: '1', fetchImpl: reject }), (err) => {
    assert.match(err.message, /HTTP 400.*chat not found/);
    assert.ok(!err.message.includes(TOKEN));
    return true;
  });

  const netFail = async (url) => { throw new TypeError(`fetch failed for ${url}`); };
  await assert.rejects(sendDocument(Buffer.from('x'), 'a.xlsx', 'c', { token: TOKEN, chatId: '1', fetchImpl: netFail }), (err) => {
    assert.ok(!err.message.includes(TOKEN), err.message);
    return true;
  });
});

test('error jaringan dicoba ulang 1x; error HTTP tidak diulang', async () => {
  const ok = () => new Response(JSON.stringify({ ok: true }), { status: 200 });
  const reset = () => Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } });
  const opts = (fetchImpl) => ({ token: TOKEN, chatId: '1', fetchImpl, retryDelayMs: 0 });

  // putus sekali lalu berhasil -> sukses, 2 panggilan, body dokumen tetap utuh di percobaan kedua
  let calls = [];
  await sendDocument(Buffer.from('xlsx'), 'a.xlsx', 'c', opts(async (url, o) => {
    calls.push(o.body.get('document').name);
    if (calls.length === 1) throw reset();
    return ok();
  }));
  assert.deepEqual(calls, ['a.xlsx', 'a.xlsx']);

  // putus dua kali -> gagal setelah 2 percobaan, tanpa token di pesan
  calls = 0;
  await assert.rejects(sendDocument(Buffer.from('x'), 'a.xlsx', 'c', opts(async () => { calls++; throw reset(); })), (err) => {
    assert.match(err.message, /ECONNRESET/);
    assert.match(err.message, /2x/);
    assert.ok(!err.message.includes(TOKEN));
    return true;
  });
  assert.equal(calls, 2);

  // Telegram menjawab error HTTP -> request sampai, jangan diulang (hindari file ganda)
  calls = 0;
  await assert.rejects(sendDocument(Buffer.from('x'), 'a.xlsx', 'c', opts(async () => {
    calls++;
    return new Response(JSON.stringify({ ok: false, description: 'Bad Request' }), { status: 400 });
  })), /HTTP 400/);
  assert.equal(calls, 1);
});

test('tanpa token/chat id langsung ditolak', async () => {
  await assert.rejects(sendDocument(Buffer.from('x'), 'a.xlsx', 'c', { token: '', chatId: '' }), /TELEGRAM_BOT_TOKEN/);
});
