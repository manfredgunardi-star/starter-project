# Pembukuan Truck - Aplikasi Akuntansi Jasa Pengiriman Pasir & Batu

Aplikasi pembukuan berbasis web untuk perusahaan jasa pengiriman pasir dan batu dengan armada truck.

## Fitur Utama

### Menu Aplikasi
1. **Laporan** - Neraca, Laba Rugi, Arus Kas, Saldo Per Akun, Buku Besar
2. **Kas & Bank** - Input transaksi kas/bank + Terima Pembayaran Pelanggan + Bayar Supplier
3. **Penjualan** - Buat invoice penjualan (terhubung ke pelanggan)
4. **Biaya** - Input transaksi biaya operasional & pembelian
5. **Pelanggan** - Master data pelanggan, rekap piutang & riwayat penjualan
6. **Supplier** - Master data supplier, rekap hutang & riwayat pembelian, input invoice pembelian
7. **Aset** - Kelola aset tetap, depresiasi otomatis, jurnal berulang
8. **Chart of Accounts** - Kelola COA (tambah akun baru / nonaktifkan akun)
9. **Pengaturan** - Kelola truck, user management, tutup buku tahunan

### Fitur Teknis
- **RBAC**: Superadmin (full), Admin (input), Reader (laporan)
- **Cost Center per Truck**: Setiap transaksi bisa di-assign ke truck
- **Pelanggan & Supplier**: Auto-generate nomor (CUST-001, SUPP-001), tracking piutang/hutang
- **Pembayaran Terintegrasi**: Bayar/terima via Kas & Bank dengan pilih customer/supplier + invoice
- **COA Dinamis**: Superadmin bisa tambah akun baru atau nonaktifkan akun existing
- **Export Excel & PDF**: Semua laporan bisa di-export
- **Jurnal Berulang**: Depresiasi, amortisasi biaya dibayar di muka
- **Tutup Buku Tahunan**: Otomatis membuat jurnal penutup
- **Responsive**: Mobile & desktop friendly
- **Firebase Free Tier**: Firestore gratis hingga 1GB storage, 50K reads/day

## Langkah-Langkah Install & Deploy (Detail)

### LANGKAH 1: Buat Firebase Project

1. Buka https://console.firebase.google.com/
2. Klik **"Add Project"** → Beri nama (misal: "pembukuan-truck") → Klik **Create Project**
3. Tunggu hingga project selesai dibuat, lalu klik **Continue**

### LANGKAH 2: Aktifkan Authentication

1. Di sidebar kiri Firebase Console, klik **Build > Authentication**
2. Klik **"Get Started"**
3. Di tab **Sign-in method**, klik **Email/Password**
4. Aktifkan toggle **Enable** → Klik **Save**

### LANGKAH 3: Buat Firestore Database

1. Di sidebar kiri, klik **Build > Firestore Database**
2. Klik **"Create Database"**
3. Pilih lokasi server: **asia-southeast2 (Jakarta)** → Klik **Next**
4. Pilih **"Start in test mode"** → Klik **Enable**
   *(Nanti akan diupdate dengan security rules yang proper)*

### LANGKAH 4: Dapatkan Konfigurasi Firebase

1. Di sidebar kiri, klik **ikon gear ⚙️ > Project Settings**
2. Scroll ke bawah ke section **"Your apps"**
3. Klik ikon Web **`</>`**
4. Beri nama app (misal: "pembukuan-web") → Klik **Register app**
5. Akan muncul kode konfigurasi seperti ini:
   ```javascript
   const firebaseConfig = {
     apiKey: "AIzaSy...",
     authDomain: "pembukuan-truck.firebaseapp.com",
     projectId: "pembukuan-truck",
     storageBucket: "pembukuan-truck.appspot.com",
     messagingSenderId: "123456789",
     appId: "1:123456789:web:abcdef"
   }
   ```
6. **COPY semua nilai** tersebut

### LANGKAH 5: Konfigurasi Project

1. Buka file `src/firebase.js` di text editor
2. Ganti semua placeholder dengan konfigurasi dari Firebase Console:
   ```javascript
   const firebaseConfig = {
     apiKey: "PASTE_API_KEY_ANDA",
     authDomain: "PASTE_AUTH_DOMAIN_ANDA",
     projectId: "PASTE_PROJECT_ID_ANDA",
     storageBucket: "PASTE_STORAGE_BUCKET_ANDA",
     messagingSenderId: "PASTE_SENDER_ID_ANDA",
     appId: "PASTE_APP_ID_ANDA"
   }
   ```

### LANGKAH 6: Install Dependencies & Jalankan Lokal

```bash
# Pastikan Node.js versi 18+ sudah terinstall
node -v

# Masuk ke folder project
cd BUL-accounting

# Install semua dependencies
npm install

# Jalankan development server
npm run dev
```
Buka browser ke **http://localhost:5173**

### LANGKAH 7: Buat User Pertama (Superadmin)

1. Buka **Firebase Console > Authentication > Users**
2. Klik **"Add User"**
3. Masukkan email dan password (misal: admin@perusahaan.com / password123)
4. Klik **Add User**
5. Buka aplikasi di browser → Login dengan email/password tersebut
6. **User pertama otomatis menjadi Superadmin**

### LANGKAH 8: Deploy ke Firebase Hosting (Gratis)

```bash
# Install Firebase CLI (jika belum)
npm install -g firebase-tools

# Login ke akun Firebase
firebase login

# Inisialisasi Firebase di folder project
firebase init

# Saat ditanya pilih:
# - Hosting: Configure files for Firebase Hosting
# - Firestore: Deploy rules and create indexes
# - Pilih project yang sudah dibuat
# - Public directory: dist
# - Single-page app: Yes
# - Overwrite index.html: No

# Build aplikasi
npm run build

# Deploy
firebase deploy
```

Setelah deploy, Firebase akan memberikan URL seperti:
**https://pembukuan-truck.web.app**

### LANGKAH 9: Deploy Firestore Security Rules

```bash
firebase deploy --only firestore:rules
```

### Alternatif Deploy: Vercel (Gratis)

```bash
npm install -g vercel
npm run build
vercel --prod
```

## Koleksi Firestore yang Digunakan

| Collection | Fungsi |
|------------|--------|
| `users` | Data user & role |
| `journals` | Jurnal akuntansi |
| `trucks` | Master data truck |
| `assets` | Data aset tetap |
| `invoices` | Invoice penjualan |
| `customers` | Master pelanggan |
| `suppliers` | Master supplier |
| `purchase_invoices` | Invoice pembelian |
| `recurring_templates` | Template jurnal berulang |
| `coa` | Akun COA custom tambahan |
| `coa_overrides` | Override status akun built-in |

## Tech Stack

- React 18 + Vite
- Tailwind CSS
- Firebase Firestore + Auth
- Lucide React (icons)
- SheetJS (export Excel)
- jsPDF + jspdf-autotable (export PDF)
