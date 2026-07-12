# Monolith Refactor Navigator (`monolith-refactor`) — Design Spec

**Tanggal:** 2026-06-14
**Status:** Disetujui (brainstorming) — siap masuk writing-plans
**Rekomendasi asal:** #2 dari sesi "rekomendasi pembuatan AI Agent"
**Backlog terkait:** [2026-06-14-ai-agent-recommendations-backlog.md](2026-06-14-ai-agent-recommendations-backlog.md)
**Pasangan:** [2026-06-14-finance-audit-agent-design.md](2026-06-14-finance-audit-agent-design.md)

---

## 1. Tujuan & Latar Belakang

Mengiris file `App.jsx` monolitik menjadi komponen-komponen terfokus **tanpa mengubah
perilaku**, mengikuti pola modular yang sudah ada. Refactor dilakukan **inkremental**
(satu unit per PR) agar tiap perubahan kecil dan mudah direview.

Kondisi nyata (diukur 2026-06-14):

| App | File terbesar | Baris | Status |
|---|---|---|---|
| **bul-monitor** | `src/App.jsx` | **7.249** | 🎯 target utama — belum dipecah (hanya App.jsx + service) |
| **sj-monitor** | `src/App.jsx` | **4.213** | sudah pernah di-split (pola `pages/`+`components/` ada) |
| bul-accounting | `pages/IntegrationReviewPage.jsx` | 1.058 | sudah modular — **dikecualikan** |
| erp-acc | `pages/.../ProductsPage.jsx` | 589 | sudah modular — **dikecualikan** |

**Insight kunci:** bul-monitor adalah varian sj-monitor, dan sj-monitor sudah punya
struktur `pages/`+`components/` hasil split. Struktur sj-monitor dipakai sebagai
**template** cara mengiris bul-monitor.

## 2. Keputusan Desain (disetujui)

| Aspek | Keputusan |
|---|---|
| Bentuk | **Subagent** (`.claude/agents/monolith-refactor.md`), di-commit, konsisten dgn `finance-auditor` |
| Jaring pengaman | **Build + Playwright E2E** — golden flows before/after dibandingkan |
| Alur | **Peta dekomposisi dulu → Anda setujui → satu unit per PR** |
| Target default | `bul-monitor` (monolit terburuk) |
| Golden flows | dijalankan via **dev server lokal** (bul-monitor tak punya staging) |
| Lokasi peta | `docs/refactor/<app>-decomposition-map.md` |

## 3. Bentuk & Lokasi

- File baru: `.claude/agents/monolith-refactor.md` (bersama `finance-auditor.md`).
- Frontmatter: `name: monolith-refactor`, `description:`, `tools: Read, Grep, Glob, Bash, Edit, Write` + Playwright MCP (`mcp__plugin_playwright_playwright__*`).

## 4. Target & Parameter

- `target`: `bul-monitor` (default — App.jsx 7.249) `| sj-monitor` (4.213).
  bul-accounting & erp-acc **dikecualikan** (sudah modular).
- `mode`: `map` (hasilkan peta dekomposisi, analitik/tanpa ubah kode) | `extract` (eksekusi satu unit dari peta).
- `unit`: id unit dari peta, wajib saat `mode=extract`.

Default: `target=bul-monitor`, `mode=map`.

## 5. Fase MAP (analitik, tanpa ubah kode)

Agent membaca `App.jsx` target lalu menghasilkan peta di
`docs/refactor/<app>-decomposition-map.md`:

- **Seam** — daftar section/feature block, sub-komponen yang di-render inline, grup state, helper.
- **Dependensi** per unit — state bersama, props, context, import.
- **Urutan ekstraksi aman** — leaf dulu / kopling terendah dulu.
- **Tanda finansial** — unit yang menyentuh `hargaPerRute`/`uangMuka`/`uangJalan`/`pajak`/`ppn`/`pph`/`debit`/`kredit` ditandai: ekstraksi struktur boleh, tapi **logika uang harus byte-identik** + diserahkan ke review manusia.
- **Template acuan** — struktur sj-monitor yang sudah ada: `pages/MasterDataPage.jsx`,
  `pages/LaporanKasPage.jsx`, `pages/InvoicePage.jsx`, `components/DockNav.jsx`.

→ **Gate:** Anda menyetujui peta sebelum ekstraksi apa pun dimulai.

## 6. Fase EXTRACT (satu unit per PR)

1. **Pre-flight** — pastikan working tree bersih; buat worktree/branch
   `claude/refactor-<app>-<unit>-YYYY-MM-DD`.
2. **Baseline E2E** — jalankan *golden flows* pada kode saat ini (dev server lokal,
   `npm run dev`) → simpan artefak baseline (screenshot + DOM snapshot + network).
3. **Ekstrak** — pindahkan unit ke file baru di `pages/` atau `components/`,
   sambungkan import/props. **Murni pemindahan struktural — tanpa ubah logika,
   tanpa rename simbol bisnis, tanpa "perbaikan" yang nyelip.**
4. **Validasi** — `npm run build` wajib lulus; jalankan ulang golden flows →
   bandingkan dengan baseline. Ada divergensi perilaku → **revert/stop** dan laporkan.
5. **Draft PR** — diff unit + bukti build lulus + perbandingan E2E before/after.
   Tanpa auto-merge, tanpa deploy.

## 7. Golden Flows

Set kecil & kunci (bukan E2E penuh, untuk hindari flaky). Daftar final **dikonfirmasi
saat fase MAP**. Kandidat untuk bul-monitor:
login → list SJ → buat SJ → edit SJ → generate invoice → uang muka → sync integrasi.

Catatan: bul-monitor tidak punya environment staging (hanya sj-monitor yang punya),
sehingga golden flows dijalankan terhadap **dev server lokal**.

## 8. Aturan Jaga-Perilaku (inti)

- Ekstraksi = **pemindahan struktural saja**; nol perubahan logika/perilaku.
- **NEVER** menyentuh/mengubah logika finansial saat refactor. Bila sebuah unit memuat
  fungsi uang, pindahkan komponen UI-nya tetapi biarkan fungsi uang **byte-identik**
  dan tandai untuk review.
- Ikuti pola yang sudah ada (struktur sj-monitor sebagai template), jangan ciptakan
  konvensi baru.

## 9. Safety Rules (paling atas file agent, meniru `bug-hunter`)

1. NEVER `firebase deploy` (semua varian).
2. NEVER commit/push ke `main` — semua lewat draft PR.
3. NEVER modifikasi `firestore.rules`, `firebase-config.js`/`firebase.js`, atau file auth.
4. NEVER ubah logika finansial saat ekstraksi.
5. `mode=map` tidak menulis kode — hanya peta di `docs/refactor/`.
6. NEVER modifikasi `CLAUDE.md`, `.claude/settings.json`, atau file workflow.

## 10. Hubungan dengan Agent/Skill Lain

- **`bug-hunter`** — fix bug per issue (TDD). **`finance-auditor`** (#1) — audit read-only.
  **`monolith-refactor`** — ekstraksi struktural. Ketiganya berbagi disiplin guardrail
  finansial yang sama (jangan sentuh logika uang tanpa persetujuan).

## 11. Di Luar Cakupan (YAGNI)

- Optimasi performa, perbaikan logika, fitur baru.
- Refactor app yang sudah modular (bul-accounting, erp-acc).
- Perubahan logika finansial apa pun.
- Setup framework test komponen (React Testing Library) — jaring pengaman memakai
  Playwright E2E, bukan unit test komponen. (Bila kelak diinginkan, itu pekerjaan terpisah.)

## 12. Kriteria Keberhasilan

- `mode=map target=bul-monitor` → peta dekomposisi yang akurat, berurutan aman,
  menandai unit finansial, tanpa mengubah satu pun file sumber.
- `mode=extract` satu unit → draft PR dengan build lulus, golden flows before/after
  identik, `App.jsx` berkurang signifikan, `main` tak tersentuh.
- Tidak ada regresi perilaku pada golden flows.
