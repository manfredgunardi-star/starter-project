#!/usr/bin/env node
// MCP server (stdio) untuk Hermes. Hanya satu tool tetap; LLM cuma mengisi parameter.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { jakartaToday, runRekap } from './rekap.js';
import { AUDIT_FILE, loadEnv, fetchSuratJalan } from './firebase.js';
import { sendDocument } from './telegram.js';

// stdout khusus protokol MCP; log apa pun (termasuk dari library) dialihkan ke stderr.
console.log = console.info = console.debug = console.error;

loadEnv();

const server = new McpServer({ name: 'sj-tools', version: '0.1.0' });

server.registerTool(
  'rekap_pengiriman',
  {
    title: 'Rekap pengiriman Surat Jalan',
    description:
      'Membuat rekap Surat Jalan (sj-monitor) untuk rentang tanggal SJ, menyimpannya sebagai Excel, lalu '
      + 'MENGIRIM file langsung ke Telegram pemilik. Hasil yang dikembalikan hanya ringkasan '
      + '(periode, jumlah SJ, total uang jalan, nama file); data baris tidak pernah dikembalikan. '
      + 'Ubah tanggal dari bahasa sehari-hari ke format YYYY-MM-DD (zona Asia/Jakarta). '
      + 'Maksimal 366 hari, tidak boleh tanggal masa depan. SJ gagal/terhapus tidak ikut, sama seperti di aplikasi.',
    inputSchema: {
      tgl_awal: z.string().describe('Tanggal SJ awal, YYYY-MM-DD (inklusif)'),
      tgl_akhir: z.string().describe('Tanggal SJ akhir, YYYY-MM-DD (inklusif)'),
      rute: z.string().optional().describe('Opsional: nama rute persis seperti di master rute'),
      pt: z.string().optional().describe('Opsional: nama PT persis seperti di data supir'),
    },
  },
  async (args) => {
    try {
      const summary = await runRekap(args, {
        today: jakartaToday(), source: 'mcp', auditFile: AUDIT_FILE, fetchRows: fetchSuratJalan, send: sendDocument,
      });
      return { content: [{ type: 'text', text: JSON.stringify(summary) }] };
    } catch (err) {
      return { isError: true, content: [{ type: 'text', text: `Rekap gagal: ${err.message}` }] };
    }
  },
);

await server.connect(new StdioServerTransport());
