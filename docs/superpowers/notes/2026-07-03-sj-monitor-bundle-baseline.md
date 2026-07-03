# Baseline Ukuran Bundle sj-monitor — 2026-07-03

Konteks: Fase A rencana `docs/superpowers/plans/2026-07-03-sj-monitor-optimization.md`.
"Sebelum" = commit `5857b91` (sebelum Task 1). "Sesudah" = commit `0e26d4e`
(lazy-load xlsx di `rejectionReportExport.js`). Ukuran on-disk (`du -k`, KB),
build production `npm run build`.

| Chunk | Sebelum | Sesudah | Catatan |
|---|---|---|---|
| index (bundle utama) | 572 | 160 | **-72%** — xlsx keluar dari critical path |
| xlsx | — | 412 | chunk baru, lazy (dimuat saat export Excel) |
| vendor-firebase | 408 | 408 | |
| jspdf.es.min | 376 | 376 | lazy (payslip PDF) |
| html2canvas.esm | 196 | 196 | dependensi jspdf, lazy |
| index.es | 156 | 156 | |
| vendor-react | 144 | 144 | |
| vendor-motion | 128 | 128 | framer-motion |
| jspdf.plugin.autotable | 32 | 32 | lazy |
| purify.es | 24 | 24 | |
| Pages (MasterData/LaporanKas/Invoice/Payslip/TarifRute/LaporanTruk dll.) | 12–20 each | 12–20 each | sudah code-split React.lazy |

Kesimpulan: payload awal (index + vendor-react + vendor-firebase + vendor-motion +
index.es) turun dari ±1.408 KB menjadi ±996 KB on-disk. Kandidat optimasi berikutnya
(di luar scope fase ini): vendor-firebase 408KB adalah chunk kritis terbesar.
