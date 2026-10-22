import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const SERVER = fileURLToPath(new URL('../src/mcp-server.js', import.meta.url));

test('MCP stdio: hanya rekap_pengiriman, error dikembalikan rapi tanpa data', async () => {
  const auditFile = join(mkdtempSync(join(tmpdir(), 'sjtools-mcp-')), 'audit.log');
  // Env minimal & tanpa kredensial: memastikan jalur gagal tidak menyentuh Firebase/Telegram sungguhan.
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [SERVER],
    // ENV_FILE ke path kosong: tes tidak pernah membaca .env asli walau dijalankan di VPS.
    env: { PATH: process.env.PATH, SYSTEMROOT: process.env.SYSTEMROOT ?? '', AUDIT_LOG: auditFile, ENV_FILE: join(tmpdir(), 'sjtools-tidak-ada.env') },
    stderr: 'pipe',
  });
  const client = new Client({ name: 'uji', version: '0.0.0' });
  await client.connect(transport);
  try {
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((t) => t.name), ['rekap_pengiriman']);
    assert.deepEqual(tools[0].inputSchema.required.sort(), ['tgl_akhir', 'tgl_awal']);

    const bad = await client.callTool({ name: 'rekap_pengiriman', arguments: { tgl_awal: '2026-10-15', tgl_akhir: '2026-10-01' } });
    assert.equal(bad.isError, true);
    assert.match(bad.content[0].text, /tgl_awal tidak boleh setelah tgl_akhir/);

    const noEnv = await client.callTool({ name: 'rekap_pengiriman', arguments: { tgl_awal: '2026-10-01', tgl_akhir: '2026-10-15' } });
    assert.equal(noEnv.isError, true);
    assert.match(noEnv.content[0].text, /\.env belum diisi/);
  } finally {
    await client.close();
  }
  const log = readFileSync(auditFile, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(log.map((e) => [e.source, e.status]), [['mcp', 'gagal'], ['mcp', 'gagal']]);
});
