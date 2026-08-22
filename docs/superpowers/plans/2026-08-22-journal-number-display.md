# No. Jurnal Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tampilkan identifier "No. Jurnal" (`j.id.slice(0, 8)`, sama seperti kolom Excel yang sudah ada) di setiap baris jurnal pada `JurnalPage` (bul-accounting), bisa dicari, dan bisa disalin penuh ke clipboard.

**Architecture:** Perubahan presentational murni pada dua komponen React yang sudah ada — `JournalList.jsx` (badge + copy-to-clipboard) dan `JurnalPage.jsx` (satu kondisi tambahan di filter pencarian). Tidak ada Firestore field baru, tidak ada perubahan pada titik penulisan jurnal manapun (`accounting.js`, `PenjualanPage.jsx`, `AsetPage.jsx`, `integrationUtils.js`, `JournalEntryForm.jsx`).

**Tech Stack:** React 18 (hooks), Tailwind CSS (utility classes, pola existing di file), `navigator.clipboard` (Web API, tanpa dependency baru).

## Global Constraints

(Verbatim dari spec `docs/superpowers/specs/2026-08-22-journal-number-display-design.md`)

- Format badge harus persis `` `#${j.id.slice(0, 8)}` `` — identik dengan kolom "No. Jurnal" di `apps/bul-accounting/src/utils/exportUtils.js:10` (`j.id?.slice(0, 8)`).
- Tidak ada field Firestore baru. Tidak menyentuh `saveJournal`, `updateJournal`, `batchImportJournals`, atau lokasi penulisan jurnal lain.
- Tidak membuat skema penomoran jurnal sequential baru — `j.id` (Firestore doc ID) tetap satu-satunya sumber identitas.
- Tidak menambah dependency/library toast baru — feedback "salin" pakai state lokal komponen.
- Klik badge menyalin ID **penuh** (`j.id`, 20 karakter), bukan versi terpotong yang ditampilkan.
- Badge harus pakai warna netral (gray), berbeda dari badge jenis jurnal yang sudah pakai brand color (`bg-brand-50 text-brand-700`), supaya tidak bersaing visual.
- Pencarian di `JurnalPage.jsx` harus menyertakan `j.id` (selain description/keterangan/accountCode yang sudah ada).
- Tidak ada framework test komponen React di codebase ini (`@testing-library/react` tidak terpasang; hanya `vitest` + tes murni untuk `src/utils/`). Verifikasi task ini dilakukan lewat `npm run build` + `npm test` (regresi) + manual smoke test di browser — bukan unit test baru, sesuai pola existing.

---

### Task 1: Badge No. Jurnal (copy-to-clipboard) + searchable

**Files:**
- Modify: `apps/bul-accounting/src/components/JournalList.jsx:17-23` (tambah state + handler), `JournalList.jsx:67-75` (tambah badge di JSX)
- Modify: `apps/bul-accounting/src/pages/JurnalPage.jsx:277-288` (tambah `j.id` ke kondisi pencarian)

**Interfaces:**
- Consumes: `j.id` — sudah ada di setiap objek jurnal yang dikembalikan `getJournals()` (`apps/bul-accounting/src/utils/accounting.js:116`, `{ id: d.id, ...d.data() }`). Tidak perlu fetch tambahan, tidak perlu prop baru dari `JurnalPage` ke `JournalList` (keduanya sudah menerima array `journals` lengkap dengan `.id`).
- Produces: tidak ada interface baru untuk task lain — ini task terakhir/satu-satunya di plan ini.

- [ ] **Step 1: Tambah state `copiedId` dan handler `handleCopyId` di `JournalList.jsx`**

Baca dulu isi file saat ini di `apps/bul-accounting/src/components/JournalList.jsx` baris 17-23 (persis seperti ini sekarang):

```jsx
export default function JournalList({ journals = [], mergedCOA = [], loading = false, onEdit, onDelete }) {
  const { isSuperadmin } = useAuth()

  const [auditLogs, setAuditLogs] = useState({})
  const [auditLoading, setAuditLoading] = useState({})
  const [auditOpen, setAuditOpen] = useState({})

  const toggleAudit = async (journalId) => {
```

Ganti dengan (menambah state `copiedId` dan fungsi `handleCopyId`, tidak menghapus apa pun):

```jsx
export default function JournalList({ journals = [], mergedCOA = [], loading = false, onEdit, onDelete }) {
  const { isSuperadmin } = useAuth()

  const [auditLogs, setAuditLogs] = useState({})
  const [auditLoading, setAuditLoading] = useState({})
  const [auditOpen, setAuditOpen] = useState({})
  const [copiedId, setCopiedId] = useState(null)

  const handleCopyId = async (id) => {
    try {
      await navigator.clipboard.writeText(id)
      setCopiedId(id)
      setTimeout(() => setCopiedId(prev => (prev === id ? null : prev)), 1500)
    } catch (_) {
      // Clipboard permission ditolak browser — badge tetap tampil, tidak ada crash.
    }
  }

  const toggleAudit = async (journalId) => {
```

`useState` sudah di-import di baris 1 file ini (`import React, { useState } from 'react'`) — tidak perlu ubah import.

- [ ] **Step 2: Tambah badge di header card jurnal**

Baris 67-75 saat ini (persis seperti ini sekarang):

```jsx
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <span className="text-sm font-semibold text-gray-800">{formatDate(j.date)}</span>
                <span className="text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded-full font-medium shrink-0">
                  {typeLabel[j.type] || j.type || 'Umum'}
                </span>
                {j.description && (
                  <span className="text-sm text-gray-500 truncate">{j.description}</span>
                )}
              </div>
```

Ganti dengan (badge baru disisipkan setelah badge jenis jurnal, sebelum deskripsi):

```jsx
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <span className="text-sm font-semibold text-gray-800">{formatDate(j.date)}</span>
                <span className="text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded-full font-medium shrink-0">
                  {typeLabel[j.type] || j.type || 'Umum'}
                </span>
                <span className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleCopyId(j.id)}
                    title="Klik untuk menyalin No. Jurnal lengkap"
                    className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-mono hover:bg-gray-200 transition-colors"
                  >
                    #{j.id.slice(0, 8)}
                  </button>
                  {copiedId === j.id && (
                    <span className="text-xs text-emerald-600">✓ Disalin</span>
                  )}
                </span>
                {j.description && (
                  <span className="text-sm text-gray-500 truncate">{j.description}</span>
                )}
              </div>
```

- [ ] **Step 3: Sertakan `j.id` di filter pencarian `JurnalPage.jsx`**

Baris 277-288 saat ini (persis seperti ini sekarang):

```jsx
  const filtered = journals.filter(j => {
    if (filterType !== 'all' && j.type !== filterType) return false
    if (filterTruck !== 'all' && j.truckId !== filterTruck) return false
    if (search) {
      const q = search.toLowerCase()
      return (
        j.description?.toLowerCase().includes(q) ||
        j.lines?.some(l => l.keterangan?.toLowerCase().includes(q) || l.accountCode?.includes(q))
      )
    }
    return true
  })
```

Ganti dengan (tambah satu baris kondisi `j.id`):

```jsx
  const filtered = journals.filter(j => {
    if (filterType !== 'all' && j.type !== filterType) return false
    if (filterTruck !== 'all' && j.truckId !== filterTruck) return false
    if (search) {
      const q = search.toLowerCase()
      return (
        j.description?.toLowerCase().includes(q) ||
        j.id?.toLowerCase().includes(q) ||
        j.lines?.some(l => l.keterangan?.toLowerCase().includes(q) || l.accountCode?.includes(q))
      )
    }
    return true
  })
```

- [ ] **Step 4: Build check**

Run: `cd apps/bul-accounting && npm run build`
Expected: build sukses tanpa error (exit code 0). Ini codebase JSX/Vite biasa — tidak ada type-check terpisah untuk task ini.

- [ ] **Step 5: Regression test suite**

Run: `cd apps/bul-accounting && npm test`
Expected: semua test existing tetap PASS (task ini tidak mengubah `accounting.js` maupun logic lain yang di-cover test suite — kalau ada test yang gagal, itu tanda ada regresi tak terduga, investigasi sebelum lanjut).

- [ ] **Step 6: Manual smoke test di browser**

Jalankan dev server bul-accounting (`npm run dev` dari `apps/bul-accounting`, atau lewat preview tool), lalu di halaman **Jurnal Umum**:
1. Pastikan tiap baris jurnal menampilkan badge abu-abu `#xxxxxxxx` (8 karakter) di sebelah badge jenis jurnal (Umum/Kas/Bank/dst).
2. Klik salah satu badge → cek indikator "✓ Disalin" muncul sebentar di sebelahnya, lalu hilang otomatis (~1.5 detik). Paste clipboard di tempat lain (mis. address bar) untuk konfirmasi isinya adalah ID Firestore penuh (20 karakter), bukan cuma 8 karakter yang tampil di badge.
3. Ketik potongan awal salah satu ID (huruf besar/kecil bebas, mis. 4-5 karakter pertama dari badge) di kotak "Cari keterangan..." → konfirmasi jurnal dengan ID itu tetap muncul di hasil filter.
4. Ketik teks acak yang tidak match ID/deskripsi/keterangan manapun → konfirmasi list kosong ("Tidak ada data jurnal pada periode ini" atau filtered kosong), memastikan kondisi baru tidak membuat filter jadi longgar secara tidak sengaja.

- [ ] **Step 7: Commit**

```bash
git add apps/bul-accounting/src/components/JournalList.jsx apps/bul-accounting/src/pages/JurnalPage.jsx
git commit -m "feat(bul-accounting): display No. Jurnal badge in Jurnal Umum list

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Model/Effort Grouping

| Task | File count | Spec completeness | Rekomendasi Model | Rekomendasi Effort |
|---|---|---|---|---|
| Task 1 — Badge + search | 2 files, kode lengkap tertulis di brief (transkripsi + verifikasi) | Lengkap — semua snippet before/after sudah pasti | **Haiku 4.5** | **Low** |
| Final whole-branch review (bawaan skill subagent-driven-development, bukan task terpisah di plan ini) | seluruh diff branch | N/A — review, bukan implementasi | Model paling capable yang tersedia (Opus 5) | High |

Task 1 murni mekanis: dua file, snippet before/after sudah eksak di atas (transkripsi + build + smoke test), tidak ada keputusan desain yang tersisa untuk implementer. Sesuai panduan Model Selection di skill `subagent-driven-development` ("touches 1-2 files with a complete spec → cheap model" dan "when the task's plan text contains the complete code to write, use the cheapest tier"), Task 1 membutuhkan **Haiku 4.5, Low effort** — bukan Sonnet 5 High.
