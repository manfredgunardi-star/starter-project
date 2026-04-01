/**
 * read-xlsx.mjs — Helper untuk Claude Code membaca file .xlsx
 * Usage: node scripts/read-xlsx.mjs <path-to-file.xlsx> [sheetName]
 *
 * Output: JSON array ke stdout, bisa dibaca Claude langsung.
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

// Dinamis import xlsx (ESM-compatible workaround untuk paket CJS)
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const [,, filePath, sheetArg] = process.argv;

if (!filePath) {
  console.error('Usage: node scripts/read-xlsx.mjs <file.xlsx> [sheetName]');
  process.exit(1);
}

const absPath = path.resolve(filePath);
const workbook = XLSX.readFile(absPath);

const sheetName = sheetArg || workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];

if (!sheet) {
  console.error(`Sheet "${sheetName}" tidak ditemukan. Sheet yang tersedia: ${workbook.SheetNames.join(', ')}`);
  process.exit(1);
}

const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

console.log(JSON.stringify({
  file: absPath,
  sheet: sheetName,
  allSheets: workbook.SheetNames,
  totalRows: rows.length,
  columns: rows.length > 0 ? Object.keys(rows[0]) : [],
  data: rows,
}, null, 2));
