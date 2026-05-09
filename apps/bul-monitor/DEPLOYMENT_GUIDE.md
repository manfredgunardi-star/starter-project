# 🚀 Panduan Deploy BUL-monitor (Firebase + Firestore)

Dokumen ini dibuat untuk Anda yang belum terlalu menguasai Firebase, supaya bisa **deploy BUL-monitor dari nol** dengan aman.

## Konsep penting (singkat)
- **Firebase Project** = “wadah” di Firebase (punya Project ID).
- Di dalamnya ada:
  - **Authentication** (akun user)
  - **Firestore** (database)
  - **Hosting** (website)
- BUL-monitor ini **dipisahkan total** dari app lain dengan pola **namespace koleksi**:
  - Semua koleksi Firestore memakai prefix **`bul_`**
  - Contoh: `bul_users`, `bul_surat_jalan`, `bul_invoice`, dst.

---

## 1) Siapkan di Firebase Console (klik-klik)

### 1.1 Buat Firebase Project baru (opsional tapi disarankan)
Kalau Anda ingin benar-benar “terpisah” dari project lama **surat-jalan-monitor**, buat project baru:

1. Buka Firebase Console
2. **Add project**
3. Isi nama project: **BUL-monitor**
4. Catat **Project ID** yang dibuat (contoh: `bul-monitor-12345`)

> Kalau Anda MAU pakai project yang sama seperti sebelumnya, Anda tetap bisa.
> Yang membedakan BUL-monitor adalah semua koleksi Firestore sudah `bul_*`.

### 1.2 Aktifkan Authentication (Email/Password)
1. Firebase Console → **Build → Authentication**
2. Klik **Get started**
3. Tab **Sign-in method**
4. Enable **Email/Password** → Save

### 1.3 Aktifkan Firestore Database
1. Firebase Console → **Build → Firestore Database**
2. Klik **Create database**
3. Pilih mode **Production** (lebih aman) atau **Test** (lebih gampang tapi tidak aman)
4. Pilih lokasi (mis. `asia-southeast2` kalau tersedia) → Create

### 1.4 (Opsional) Aktifkan Storage
Kalau Anda butuh upload file:
1. Firebase Console → **Build → Storage**
2. Klik **Get started** → Next → Done

---

## 2) Siapkan di komputer Anda (sekali saja)

### 2.1 Install
- **Node.js LTS** (minimal Node 18/20)
- **Firebase CLI**

Buka CMD / PowerShell:
```bash
npm i -g firebase-tools
firebase login
```

---

## 3) Konfigurasi project lokal BUL-monitor

### 3.0 Tambahkan konfigurasi Firebase Web App (WAJIB)
App ini memakai **Vite env**. Artinya, sebelum `npm run dev` / `npm run build`, Anda harus membuat file **`.env`** di folder project (sejajar dengan `package.json`).

Langkahnya:
1. Firebase Console → **Project settings (⚙️)** → tab **General**
2. Scroll ke **Your apps** → jika belum ada Web App, klik **</>** (Add app) lalu buat Web App.
3. Setelah Web App dibuat, Anda akan melihat **firebaseConfig** (apiKey, authDomain, projectId, dst).
4. Buat file **`.env`** dan isi seperti ini (contoh format):

```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

✅ Setelah `.env` dibuat: **tutup & buka ulang terminal**, lalu lanjut langkah berikutnya.

### 3.1 Extract ZIP ini ke folder kerja
Contoh:
- `C:\Project\BUL-monitor`

### 3.2 Install dependency
Masuk ke folder project:
```bash
npm install
```

### 3.3 Set Firebase Project ID untuk CLI
File `.firebaserc` di ZIP ini berisi placeholder:
- `REPLACE_WITH_YOUR_FIREBASE_PROJECT_ID`

Anda harus mengganti dengan **Project ID** Anda.

**Cara termudah (tanpa edit file manual):**
```bash
firebase use --add
```
- Pilih project Firebase Anda
- Beri alias: `default`

> Setelah ini, Firebase CLI akan menyimpan mapping project Anda.

---

## 4) Deploy Firestore Rules (WAJIB)
Karena BUL-monitor pakai koleksi `bul_*`, rules di repo ini sudah disiapkan untuk itu.

Deploy:
```bash
firebase deploy --only firestore:rules
```

---

## 5) Jalankan lokal dulu (WAJIB sebelum deploy hosting)
```bash
npm run dev
```
Buka URL yang muncul (biasanya `http://localhost:5173`).

✅ Pastikan halaman terbuka dan tidak error merah.

---

## 6) Deploy Hosting (Website)
### 6.1 Build produksi
```bash
npm run build
```

### 6.2 Deploy hosting
```bash
firebase deploy --only hosting
```

---

## 7) (Opsional) Hosting “multi-site” agar tidak menimpa hosting app lain
Kalau Anda memakai **Firebase Project yang sama** dengan app lain, dan Anda tidak ingin overwrite hosting lama, pakai multi-site.

### 7.1 Buat site hosting baru
```bash
firebase hosting:sites:create bul-monitor
```

### 7.2 Arahkan target hosting
```bash
firebase target:apply hosting bul-monitor bul-monitor
```

### 7.3 Deploy ke site BUL-monitor
```bash
firebase deploy --only hosting
```

> Repo ini sudah set `firebase.json` memakai target: `bul-monitor`.

---

## 8) Login pertama (karena Auth masih kosong)
Karena rules Production bersifat ketat, **user pertama sebaiknya dibootstrap 1x**:

### Opsi paling aman (disarankan): bootstrap manual 1x
1. Firebase Console → **Authentication → Users** → **Add user**
   - Email disarankan: `<username>@bul.local` (contoh: `manfred@bul.local`)
   - Password: tentukan
2. Firebase Console → **Firestore → Data** → **Start collection**
   - Collection ID: `bul_users`
   - Document ID: **pakai UID** user dari Authentication
   - Field minimal:
     - `role`: `"superadmin"`
     - `email`: email user
     - `isActive`: `true`
     - `createdAt`: timestamp
3. Setelah itu, Anda bisa login di UI cukup dengan **username** (tanpa email), karena app akan otomatis menambahkan `@bul.local`.

### Catatan login
- Jika Anda mengetik **tanpa karakter `@`**, sistem menganggap itu username → menjadi `<username>@bul.local`.
- Jika Anda mengetik **email lengkap**, sistem memakai email tersebut apa adanya.

---

## Troubleshooting cepat
- **"Missing or insufficient permissions"** → rules belum terdeploy / role user doc belum ada di `bul_users`
- **Build error** → jalankan `npm install` ulang, pastikan Node versi LTS
- **Hosting deploy sukses tapi blank** → pastikan `npm run build` menghasilkan folder `dist`

