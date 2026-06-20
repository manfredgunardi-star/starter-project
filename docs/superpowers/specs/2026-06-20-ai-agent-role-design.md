# Desain: Akun AI Agent dengan role `ai_agent` (least-privilege, client-SDK)

- **Tanggal:** 2026-06-20
- **Status:** Disetujui (siap masuk perencanaan implementasi)
- **Cakupan:** bul-monitor + bul-accounting (dua Firebase project terpisah)

## Tujuan

Menyediakan **satu identitas AI Agent** yang dapat:

- Membuat **Surat Jalan** dan **Invoice** di bul-monitor.
- Membuat **Jurnal** di bul-accounting.

…sambil tetap **terkunci**: AI tidak boleh mengedit, menghapus, atau memposting-ulang
record apa pun setelah dibuat. Akun utama (superadmin) memegang kontrol eksklusif atas
semua mutasi & penghapusan — peran "approve" bersifat **koreksi setelahnya**, bukan
gerbang sebelum-live.

## Keputusan desain (hasil brainstorming)

| Keputusan | Pilihan | Alasan |
|---|---|---|
| Makna "approve" | **Live tapi terkunci** | AI buat record live; tak bisa edit/hapus. Hanya superadmin yang koreksi. Memanfaatkan batas role yang sudah ada, tanpa membangun alur draft→approve baru. |
| Bentuk role | **Role baru `ai_agent`** per app (Opsi A) | Least-privilege sejati + satu identitas bersih untuk audit. Ditolak: memberi `superadmin`/`owner` (terlalu kuat) dan memakai `admin` bul-accounting (terlalu luas). |
| Cara auth | **Client SDK, login user biasa** | `firestore.rules` BERLAKU penuh → lock dijamin database, bukan kode. Blast radius saat kredensial bocor terbatas (hanya bisa create, tak bisa hapus/edit). Admin SDK ditolak karena melewati rules. |
| Uang jalan saat buat SJ | **Diizinkan** (field-shape ketat) | Pembuatan SJ otomatis menulis `bul_transaksi` pengeluaran uang jalan ([App.jsx:1603](../../../apps/bul-monitor/src/App.jsx)). Tanpa hak ini SJ tak konsisten. Tetap terkunci: hanya create + soft-delete `isActive`. |

## Kenyataan "1 akun"

bul-monitor dan bul-accounting adalah dua Firebase project terpisah dengan sistem Auth
masing-masing. Satu Firebase Auth user tidak bisa melintasi dua project. Maka "1 akun" =
**satu identitas/email yang sama** (mis. `ai-agent@bul.internal`) yang didaftarkan di
**kedua** project, masing-masing diberi role `ai_agent`. Satu identitas logis; dua entri
kredensial teknis.

## Komponen

### 1. Identitas & provisioning

- Email tunggal, mis. `ai-agent@bul.internal`, dibuat sebagai Firebase Auth user di kedua project.
- User doc dengan `role: 'ai_agent'`:
  - bul-monitor → `bul_users/{uid}`
  - bul-accounting → `users/{uid}`
- Provisioning oleh **superadmin** (rules bul-monitor mengizinkan superadmin membuat user doc).
  Agent **tidak memakai UI manusia**; ia menulis langsung via client SDK.
- Catatan: dropdown role di UI (`UsersManagement`, `AuthContext.ROLES`) **tidak** perlu
  menambahkan `ai_agent` (agen di-provision di luar UI). Jika ingin terlihat di panel user,
  itu opsional dan terpisah dari cakupan keamanan ini.

### 2. Role `ai_agent` di bul-monitor (`apps/bul-monitor/firestore.rules`)

Cermin gabungan `admin_sj` + `admin_invoice`, **create-only**:

| Koleksi | Hak `ai_agent` |
|---|---|
| `bul_surat_jalan` / `bul_suratJalan` | `create` |
| `bul_transaksi` | `create` pengeluaran uang jalan dengan field-shape ketat (identik aturan `admin_sj` di [firestore.rules:138-144](../../../apps/bul-monitor/firestore.rules)); `update` hanya `['isActive','updatedAt','updatedBy']` (soft-delete) |
| `bul_invoice` / `bul_invoices` | `create` + `update` |
| `bul_surat_jalan` (tandai ter-invoice) | `update` terbatas `sjInvoiceFieldsOnly` |
| `bul_history_log` | `create` |

Implementasi: tambah helper `isAiAgent()` dan sertakan `'ai_agent'` pada klausa yang relevan.
Kemungkinan besar paling bersih: perlakukan `ai_agent` setara `admin_sj`+`admin_invoice` pada
klausa-klausa create/update di atas. **Tidak** dimasukkan ke `isStaff()` kecuali terbukti perlu
untuk membaca (`bul_transaksi` read butuh `isStaff()`); evaluasi saat implementasi.

### 3. Role `ai_agent` di bul-accounting (`apps/bul-accounting/firestore.rules`)

Role **baru** (bukan `admin`), **create-only**:

| Koleksi | Hak `ai_agent` |
|---|---|
| `journals` | `create` saja |
| `audit_log` | `create` |

Implementasi: tambah helper `isAiAgent()` dan ubah hanya klausa create `journals`:
`allow create: if isAdminOrAbove() || isAiAgent();`. Tidak menyentuh koleksi lain.

### 4. Yang TEGAS dilarang (kedua app)

`delete` apa pun · `update`/edit jurnal · edit SJ di luar field invoice · master data ·
settings · kelola user · transaksi keuangan di luar uang jalan. Semua ditolak oleh
database melalui rules, bukan sekadar oleh kode aplikasi.

### 5. Cara auth (client SDK)

- Agent `signInWithEmailAndPassword` di awal sesi → ID token berlaku 1 jam, auto-refresh oleh SDK.
- Kredensial disimpan di secret manager (bukan di repo).
- Boleh berjalan headless di server, **tetap** sebagai user ter-scope — **bukan** Admin SDK
  (Admin SDK melewati rules dan membatalkan seluruh model keamanan ini).

### 6. Audit & pengujian

- Setiap tulisan menyertakan identitas/UID agent (`createdBy`).
- **Wajib** uji `firestore.rules` (Firebase emulator / rules unit test) sebelum live:
  - ✅ `ai_agent` BISA: create SJ, create transaksi uang jalan (field valid), create+update invoice,
    update SJ field invoice saja, create jurnal, create history/audit log.
  - ❌ `ai_agent` DITOLAK: delete apa pun, update/edit jurnal, edit SJ non-invoice, write master data,
    write settings, write user doc orang lain, create transaksi non-uang-jalan / field tidak sesuai.

## Boundary keamanan & deployment

- Perubahan menyentuh **Security Guardrail** (CLAUDE.md): edit `firestore.rules` di 2 project — sudah
  disetujui user secara eksplisit untuk desain ini.
- Menyentuh **financial data** (uang jalan, jurnal) — sudah disetujui user.
- **Claude tidak melakukan deploy.** Implementasi menghasilkan perubahan file rules + tes rules +
  skrip/panduan provisioning. Deploy rules ke Firebase dilakukan **user**.

## Out of scope (sengaja ditunda)

- Alur draft→approve sebelum-live (pilihan "Draft dulu" yang tidak dipilih).
- Pemakaian `integration_queue`/bul-bridge sebagai mekanisme approve.
- Mencabut/menambah role di dropdown UI manusia.
- Logika orkestrasi/agent itu sendiri (apa yang diputuskan agent untuk ditulis) — desain ini
  hanya soal **izin & batas keamanan** akun.
