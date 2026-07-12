# AI Agent Recommendations — Backlog (untuk dibahas kemudian)

**Tanggal:** 2026-06-14
**Konteks:** Dari sesi brainstorming "rekomendasi pembuatan AI Agent". Operator = developer (solo).
Otonomi yang disetujui = boleh-tulis-dengan-guardrail. Pain point yang disasar = akurasi
keuangan & audit, input data manual, pelaporan & rekap, maintenance kode.

**Status:**
- #1 Finance Audit Agent → **sedang dikembangkan jadi spec** (sesi ini).
- #2 Monolith Refactor Navigator → **sedang dikembangkan jadi spec** (sesi ini).
- #3–#6 (dokumen ini) → **ditahan untuk dibahas kemudian.**

Infrastruktur AI yang SUDAH ADA (jangan duplikat): `bug-hunter` (pipeline otonom fix kode),
`gl-sync` (Firestore → Google Sheets akuntansi), `bul-monitor-sync` (jembatan data),
`jurnal-mcp` (MCP server), skill `deploy-check` / `pr` / `ui-ux-pro-max`.

---

## #3 — Nightly Data Anomaly Monitor (Automation otonom) ⭐

**Ringkasan:** Saudara kembar `bug-hunter`, tapi memeriksa **DATA bisnis, bukan kode**.
Jalan terjadwal (pola GitHub Actions + akses Firestore seperti `gl-sync`), menandai anomali.

**Yang diperiksa (kandidat):**
- Jurnal tidak balance (total debit ≠ kredit).
- "Sisa" invoice tidak cocok dengan tagihan − pembayaran − potongan uang muka.
- Uang muka over-alokasi (terpakai > tersedia).
- PPN/PPh bernilai nol yang janggal (mengacu isu yang pernah diperbaiki).
- Penghapusan/perubahan tanpa `addHistoryLog` (audit trail bolong).
- Hard-delete data bisnis (harusnya selalu soft delete).

**Output:** GitHub issue / tab Google Sheets / notifikasi.
**Otonomi:** read-only → laporan. Sangat aman.
**Pain point:** akurasi keuangan + pelaporan.
**Effort:** sedang.
**Catatan keterkaitan:** Bisa berbagi modul deteksi dengan #1 Finance Audit Agent
(satu memeriksa LOGIKA di kode, satu memeriksa DATA di Firestore).

---

## #4 — Auto-Report Composer (Automation otonom)

**Ringkasan:** Agent terjadwal yang merangkum periode (harian/bulanan) menjadi laporan
siap-kirim ke owner/konsultan, di atas data yang sudah disiapkan `gl-sync`.

**Sumber data:** tab hasil gl-sync — Trial Balance Bulanan, Laba Rugi, Neraca,
Aging Piutang, Profitabilitas Truck, Rekonsiliasi Kas Bank.

**Output:** draft laporan (PDF/Markdown/email) → developer kirim.
**Otonomi:** draft-with-approval.
**Pain point:** pelaporan & rekap.
**Effort:** rendah (sumber data sudah tersedia dari gl-sync).

---

## #5 — OCR Surat Jalan / Document Intake (Fitur AI in-app) 👤

**Ringkasan:** Foto surat jalan kertas → Claude vision mengekstrak `nomorSJ`, tanggal,
rute, material, qty → **pre-fill form sebagai draft**, manusia konfirmasi sebelum simpan.

**Target app:** sj-monitor / bul-monitor (modul Surat Jalan).
**Otonomi:** draft-with-approval (tidak menyimpan otomatis).
**Pain point:** input data manual (paling langsung mengurangi salah ketik).
**Effort:** sedang–tinggi (integrasi UI + model vision + penanganan foto buram).
**Catatan operator:** awalnya dipakai developer; bisa dibuka ke admin SJ kemudian.

---

## #6 — "Tanya Laporan" — Asisten Query Bahasa Alami (Fitur AI in-app) 👤

**Ringkasan:** Tanya data akuntansi dengan bahasa biasa (mis. "berapa piutang jatuh
tempo bulan ini?", "profit truck B-1234 kuartal lalu?") → agent menerjemahkan ke query
Firestore/Supabase lalu menjawab.

**Otonomi:** read-only.
**Pain point:** pelaporan & akurasi.
**Effort:** sedang.
**Catatan operator:** awalnya untuk developer; berpotensi jadi fitur owner/konsultan.

---

## Catatan urutan yang disarankan
Setelah #1 dan #2 selesai: lanjut #3 (memakai ulang infra bug-hunter & gl-sync,
risiko rendah), lalu #4 (cepat), kemudian baru fitur in-app #5/#6 yang lebih besar.
