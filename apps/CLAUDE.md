# apps — Workspace Aktif (Handover dari Cowork, 20 Jul 2026)

Pemilik: Memen (manfred.gunardi@gmail.com)

## Konteks
Folder ini adalah SATU-SATUNYA tempat kerja aktif untuk 4 project:
`bul-accounting`, `bul-monitor`, `erp-acc`, `sj-monitor`.
Masing-masing project punya CLAUDE.md sendiri — baca CLAUDE.md project terkait sebelum mengerjakan project itu.

Arsip versi lama ada di `C:\Users\m3m31\OneDrive\Desktop\Projects\` (struktur cermin: 4 folder nama sama).
Arsip itu HANYA arsip — jangan develop atau deploy dari sana.

## Git — status sebenarnya (dikoreksi 20 Jul 2026)
Keempat project SUDAH ter-versioning di repo induk `C:\Project` (branch `main`,
remote `https://github.com/manfredgunardi-star/starter-project.git`).
Folder `apps` adalah bagian dari monorepo itu — JANGAN PERNAH `git init` di sini
(akan membuat nested repo dan memutus riwayat dari repo induk).
Semua perintah git dijalankan biasa saja; git otomatis memakai `C:\Project\.git`.
Biasakan `git push` di akhir sesi — commit lokal yang belum di-push tidak aman
dari kerusakan laptop.

## PERINGATAN deploy sj-monitor
`OneDrive\Desktop\Projects\sj-monitor\firebase-deploy-firestore-versi-lama\` menunjuk
Firebase project YANG SAMA (`surat-jalan-monitor`) dengan `apps\sj-monitor`, tapi kodenya usang
(6 file src vs 78 di sini). `firebase deploy` dari salinan lama = menimpa aplikasi live.
Selalu deploy dari `C:\Project\apps\sj-monitor`.

## Status project (per 20 Jul 2026)
| Project | Firebase | Catatan |
|---|---|---|
| bul-accounting | bul-accounting | node_modules ada, .firebase cache ada |
| bul-monitor | bul-monitor | hosting target dikonfigurasi |
| erp-acc | (belum ada .firebaserc) | — |
| sj-monitor | surat-jalan-monitor (+ staging sj-monitor-staging) | paling aktif, edit terakhir 12–14 Jul |

## Item terbuka lain (dari sesi pembersihan Cowork)
- `Docs\Kredensial\` di OneDrive Desktop masih berisi kunci VPS `.pem` + recovery key → pindahkan ke password manager, hapus dari folder sync.
- `OneDrive\Desktop\Projects\sj-monitor\firebase-deploy-firestore-OLD\` → hapus setelah yakin tidak dibutuhkan.
- `Docs\Old Firefox Data` (561 file) → kandidat hapus setelah dicek.
- `Drive Lost and Found\Februari 2025.xlsx` versi lokal ≠ versi Google Drive → bandingkan dulu.

## Kebiasaan kerja
- Sesi Claude Code: buka dari `C:\Project\apps\<project>` (atau root ini untuk kerja lintas-project).
- Snapshot milestone: ZIP ke `OneDrive\Desktop\Projects\<project>\_archives\`.
- Folder `apps` TIDAK di jalur OneDrive — aman untuk `npm install` tanpa pause sync.
