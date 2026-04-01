# 📱 Panduan Pasang AbsenKu
### Untuk pengguna tanpa latar belakang IT

> **Perkiraan waktu:** 30–45 menit  
> **Yang Anda butuhkan:** Laptop/PC, koneksi internet, dan akun Gmail

---

## Sebelum Mulai — Pahami Dulu Ini

Aplikasi AbsenKu terdiri dari dua bagian yang bekerja bersama:

- **Firebase** → "gudang data" online tempat semua data absensi, akun karyawan, dan konfigurasi kantor tersimpan. Gratis untuk perusahaan kecil.
- **Cloudflare Pages** → "rumah" aplikasi di internet, tempat karyawan mengakses AbsenKu lewat browser HP. Gratis selamanya.

Proses ini seperti: pertama kita siapkan gudangnya (Firebase), lalu kita pasang papan namanya di internet (Cloudflare). Setelah selesai, aplikasi bisa diakses dari HP manapun.

---

## BAGIAN 1 — Siapkan Firebase (Gudang Data)

### Langkah 1 — Buat Akun Firebase

1. Buka browser, pergi ke: **https://console.firebase.google.com**
2. Anda akan diminta login dengan **akun Google (Gmail)**. Gunakan akun Gmail perusahaan Anda.
3. Setelah masuk, Anda akan melihat halaman bertuliskan "Welcome to Firebase".

---

### Langkah 2 — Buat Project Baru

1. Klik tombol besar **"Create a project"**.
2. Di kolom **"Project name"**, ketik nama proyek Anda, misalnya: `absenku-perusahaan`
   > Nama boleh apa saja, tapi hindari spasi — gunakan tanda hubung (-) sebagai gantinya.
3. Klik **"Continue"**.
4. Di halaman berikutnya ada pertanyaan tentang Google Analytics. **Matikan** tombolnya (posisi abu-abu), lalu klik **"Create project"**.
5. Tunggu sekitar 30 detik hingga muncul animasi roket. Setelah selesai, klik **"Continue"**.

---

### Langkah 3 — Aktifkan Firestore (Gudang Data)

1. Di menu sebelah kiri, klik **"Build"** untuk membuka submenu.
2. Klik **"Firestore Database"**.
3. Klik tombol **"Create database"** yang ada di tengah halaman.
4. Pilih **"Start in production mode"**, lalu klik **"Next"**.
5. Di kolom lokasi server, pilih **`asia-southeast1`** (server di Singapura, paling dekat dengan Indonesia).
6. Klik **"Enable"** dan tunggu sekitar 1 menit.
7. Setelah selesai, Anda akan melihat halaman database yang masih kosong.

---

### Langkah 4 — Pasang Aturan Keamanan Database

1. Di halaman Firestore, klik tab **"Rules"** (ada di bagian atas halaman).
2. Anda akan melihat teks kode yang sudah ada. **Hapus semua teks tersebut.**
3. Salin teks berikut ini seluruhnya, lalu tempel ke kotak yang kosong tadi:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

4. Klik tombol **"Publish"**.
5. Klik **"Publish"** lagi pada kotak konfirmasi yang muncul.

---

### Langkah 5 — Buat Index Database (4 buah)

Index berguna agar pencarian data absensi berjalan cepat. Anda perlu membuat 4 index secara manual.

1. Klik tab **"Indexes"** (di sebelah tab "Rules").
2. Klik tombol **"Add index"**.

**Buat Index 1:**

| Kolom | Isi |
|---|---|
| Collection ID | `attendance` |
| Field 1 | `userId` — Ascending |
| Field 2 | `year` — Ascending |
| Field 3 | `month` — Ascending |

Klik **"Create index"**, tunggu hingga muncul tanda ✅, lalu klik "Add index" lagi.

---

**Buat Index 2:**

| Kolom | Isi |
|---|---|
| Collection ID | `attendance` |
| Field 1 | `userId` — Ascending |
| Field 2 | `date` — Ascending |

Klik **"Create index"**, tunggu ✅, lalu klik "Add index" lagi.

---

**Buat Index 3:**

| Kolom | Isi |
|---|---|
| Collection ID | `attendance` |
| Field 1 | `year` — Ascending |
| Field 2 | `month` — Ascending |

Klik **"Create index"**, tunggu ✅, lalu klik "Add index" lagi.

---

**Buat Index 4:**

| Kolom | Isi |
|---|---|
| Collection ID | `attendance` |
| Field 1 | `year` — Ascending |
| Field 2 | `month` — Ascending |
| Field 3 | `userId` — Ascending |

Klik **"Create index"**, tunggu ✅.

> ⏳ Setiap index butuh 1–3 menit untuk selesai. Anda boleh lanjut ke langkah berikutnya sambil menunggu.

---

### Langkah 6 — Ambil "Kunci" Firebase

Kode ini menghubungkan aplikasi AbsenKu ke database Firebase Anda.

1. Klik ikon **⚙️** (roda gigi) di pojok kiri atas halaman, lalu klik **"Project settings"**.
2. Scroll ke bawah ke bagian **"Your apps"**.
3. Klik ikon **`</>`** (ikon kode, berbentuk tanda kurung sudut).
4. Di kotak yang muncul, isi **"App nickname"** dengan nama apa saja, misalnya: `absenku-web`
5. Pastikan kotak **"Firebase Hosting"** tidak dicentang.
6. Klik **"Register app"**.
7. Akan muncul kotak berisi kode. Biarkan halaman ini tetap terbuka — kita butuh ini di langkah berikutnya.

---

### Langkah 7 — Isi File `firebase-config.js`

1. Di komputer Anda, buka folder hasil ekstrak ZIP yang Anda terima (bukan file ZIP-nya, tapi isinya).
2. Cari file bernama **`firebase-config.js`**.
   - Di Windows: klik kanan → "Open with" → **Notepad**
   - Di Mac: klik kanan → "Open with" → **TextEdit**
3. Anda akan melihat teks seperti ini:

```
const FIREBASE_CONFIG = {
  apiKey:            "GANTI_DENGAN_apiKey_ANDA",
  authDomain:        "GANTI_DENGAN_authDomain_ANDA",
  projectId:         "GANTI_DENGAN_projectId_ANDA",
  storageBucket:     "GANTI_DENGAN_storageBucket_ANDA",
  messagingSenderId: "GANTI_DENGAN_messagingSenderId_ANDA",
  appId:             "GANTI_DENGAN_appId_ANDA"
};
```

4. Kembali ke halaman Firebase. Dari kotak kode yang terbuka tadi, salin nilai untuk setiap baris dan tempel ke file `firebase-config.js` menggantikan teks `"GANTI_DENGAN_..."`.

   Contoh hasil akhirnya:

```
const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyBxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  authDomain:        "absenku-perusahaan.firebaseapp.com",
  projectId:         "absenku-perusahaan",
  storageBucket:     "absenku-perusahaan.appspot.com",
  messagingSenderId: "123456789012",
  appId:             "1:123456789012:web:abcdef123456"
};
```

> ⚠️ **Penting:** Pastikan setiap nilai tetap diapit tanda kutip `" "`. Jangan hapus tanda kutip, titik koma, atau koma yang sudah ada di file.

5. Simpan file: **Ctrl+S** (Windows) atau **Cmd+S** (Mac).
6. Kembali ke halaman Firebase, klik **"Continue to console"**.

---

## BAGIAN 2 — Pasang di Internet (Cloudflare Pages)

### Langkah 8 — Buat Akun Cloudflare

1. Buka: **https://pages.cloudflare.com**
2. Klik **"Sign up"** dan daftar menggunakan email Anda.
3. Cek email Anda untuk verifikasi, lalu klik link yang dikirimkan.
4. Setelah masuk, Anda akan berada di halaman dashboard Cloudflare.

---

### Langkah 9 — Upload Aplikasi

1. Di menu sebelah kiri, klik **"Workers & Pages"**.
2. Klik tab **"Pages"**, lalu klik **"Create a project"**.
3. Pilih **"Direct Upload"** (bukan "Connect to Git").
4. Di kolom **"Project name"**, ketik nama situs Anda, contoh: `absenku`
   > Nama ini akan menjadi alamat website: `absenku.pages.dev`
5. Klik **"Create project"**.
6. Akan muncul area upload. Klik **"select from computer"**, lalu pilih **semua file** di dalam folder hasil ekstrak ZIP:
   - `index.html`
   - `firebase-config.js`
   - `_redirects`
   - `firestore.indexes.json`
   - `firestore.rules`
   - `PANDUAN_DEPLOY.md`

   > Pilih semua 6 file sekaligus (Ctrl+A atau Cmd+A di dalam folder), bukan folder-nya.

7. Klik **"Deploy site"**.
8. Tunggu sekitar 30 detik. Setelah selesai, akan muncul URL seperti: `https://absenku.pages.dev`

---

### Langkah 10 — Uji Coba

1. Buka URL yang diberikan Cloudflare di browser HP atau laptop Anda.
2. Login dengan akun default:
   - **Username:** `admin`
   - **Password:** `admin123`
3. Jika berhasil masuk dan melihat tampilan aplikasi, selamat — **AbsenKu Anda sudah online!** 🎉

---

## BAGIAN 3 — Pengaturan Pertama Kali

### Langkah 11 — Ganti Password Admin ⚠️ WAJIB

Lakukan ini segera setelah pertama login!

1. Login sebagai `admin`.
2. Klik tab **"Profil"** di menu bawah.
3. Scroll ke bawah, klik **"🔑 Ganti Password"**.
4. Masukkan password lama (`admin123`), lalu buat password baru yang kuat.
5. Klik **"Simpan"**.

---

### Langkah 12 — Atur Lokasi Kantor

1. Klik tab **"Admin"** di menu bawah.
2. Klik tab **"QR & Lokasi"**.
3. Di bagian "Lokasi Kantor", klik **"➕ Tambah Lokasi Kantor"**.
4. Isi nama kantor dan alamat.
5. Klik **"📍 Deteksi Lokasi Saya Sekarang"** — pastikan Anda membuka aplikasi dari HP yang berada **di lokasi kantor** saat menekan tombol ini, agar koordinat GPS tepat.
6. Atur **Radius Toleransi**: jarak dalam meter yang masih dianggap "di kantor". Angka 20–50 meter sudah cukup untuk kebanyakan kantor.
7. Klik **"Simpan"**, lalu klik **"Jadikan aktif"** pada kartu lokasi yang baru dibuat.

---

### Langkah 13 — Tambah Akun Karyawan

1. Di halaman Admin, klik tab **"Kelola User"**.
2. Klik **"➕ Tambah User Baru"**.
3. Isi data karyawan: nama lengkap, username (untuk login), password awal, jabatan, divisi.
4. Pilih **Access**: `user` untuk karyawan biasa, `admin` untuk yang bisa mengelola sistem.
5. Klik **"Tambahkan"**.
6. Ulangi untuk setiap karyawan.
7. Bagikan username dan password awal ke masing-masing karyawan, dan minta mereka segera menggantinya via menu Profil.

---

### Langkah 14 — Buat QR Code untuk Absensi

1. Di halaman Admin, klik tab **"QR & Lokasi"**.
2. Pilih mode QR:
   - **⏱ Sementara:** QR berlaku 5 menit. Cocok ditampilkan di layar saat jam masuk.
   - **♾ Permanen:** QR tidak kadaluarsa. Cocok dicetak dan ditempel di dinding kantor.
3. Pilih lokasi kantor dari dropdown.
4. Klik **"Generate QR Code"**.
5. Untuk QR permanen: klik kanan pada gambar QR → "Save image as..." → cetak dan tempel di kantor.

---

## ✅ Selesai!

Karyawan bisa mulai absen dengan cara:
1. Buka browser di HP → ketik alamat website AbsenKu
2. Login dengan username dan password masing-masing
3. Klik **"Absen Masuk"** atau **"Absen Pulang"**
4. Pilih metode: **GPS** (otomatis) atau **Scan QR** (scan QR yang ditempel di kantor)
5. Konfirmasi dan selesai

---

## Jika Ada Masalah

**"Gagal terhubung ke Firebase"**
→ Buka kembali `firebase-config.js` dan pastikan semua 6 nilai sudah diisi dengan benar. Tidak boleh ada yang masih bertuliskan `GANTI_DENGAN_...`.

**Halaman putih atau aplikasi tidak bisa dibuka**
→ Pastikan semua 6 file sudah terupload ke Cloudflare Pages. Coba upload ulang dari awal.

**"Missing or insufficient permissions"**
→ Kembali ke Firebase → Firestore → Rules, pastikan aturan keamanan sudah di-Publish dengan benar.

**"Query requires an index"**
→ Kembali ke Firebase → Firestore → Indexes, pastikan semua 4 index sudah selesai dibuat (status ✅ bukan ⏳).

**GPS tidak terdeteksi saat absen**
→ Aplikasi otomatis masuk "Demo Mode" dan absensi tetap bisa dilakukan. Minta karyawan mengizinkan akses lokasi di browser HP mereka (biasanya ada notifikasi yang muncul).

**Perlu bantuan lebih lanjut?**
→ Screenshot pesan error yang muncul dan kirimkan ke pengembang aplikasi Anda.

---

## Estimasi Biaya

Untuk perusahaan dengan hingga 500 karyawan yang absen normal, seluruh layanan ini **gratis selamanya**.

| Layanan | Batas Gratis | Perkiraan Anda (100 karyawan) |
|---|---|---|
| Cloudflare Pages | Tidak terbatas | ✅ Gratis |
| Firebase (baca data) | 50.000 per hari | ~300–500 per hari |
| Firebase (tulis data) | 20.000 per hari | ~200–300 per hari |
| Firebase (penyimpanan) | 1 GB | ~10 MB per tahun |
