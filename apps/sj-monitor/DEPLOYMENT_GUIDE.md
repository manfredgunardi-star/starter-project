# 🚀 PANDUAN DEPLOY APLIKASI SURAT JALAN MONITOR - FIRESTORE VERSION

## 📋 FITUR APLIKASI VERSI INI

✅ **Multi-User Real-Time Sync** - Data sync otomatis antar semua user
✅ **Cloud Database** - Firebase Firestore (data tersimpan di cloud)
✅ **Audit Log Lengkap** - Track siapa, kapan, melakukan apa
✅ **Export Excel** - Surat Jalan, Keuangan, Invoice
✅ **Online 24/7** - Tidak perlu PC menyala
✅ **Offline Support** - Bisa kerja offline, sync otomatis saat online
✅ **Multi-Device** - Akses dari HP, tablet, laptop
✅ **Persistent Data** - Data tidak hilang

---

## 🎯 LANGKAH 1: SETUP FIREBASE PROJECT

### A. Create Firebase Project

1. **Buka Firebase Console:**
   - URL: https://console.firebase.google.com/
   - Login dengan Google Account

2. **Create Project:**
   - Klik "Add project" atau "Create a project"
   - Project name: `Surat Jalan Monitor`
   - Project ID: (auto-generated, catat ini!)
   - Google Analytics: OFF (tidak perlu)
   - Klik "Create project"
   - Tunggu ~30 detik
   - Klik "Continue"

---

### B. Enable Firestore Database

1. **Navigate to Firestore:**
   - Sidebar kiri → **Build** → **Firestore Database**
   - Klik **"Create database"**

2. **Select Mode:**
   - Pilih: **"Start in production mode"**
   - Klik **"Next"**

3. **Select Location:**
   - Pilih: **"asia-southeast1 (Singapore)"** ← PENTING untuk Indonesia!
   - Klik **"Enable"**
   - Tunggu ~1 menit

4. **Setup Security Rules:**
   - Tab **"Rules"**
   - Replace semua isi dengan:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // App data - read/write untuk semua (sementara)
    match /app-data/{document} {
      allow read, write: if true;
    }
    
    // Audit logs - read untuk semua, write untuk semua
    match /audit-logs/{document} {
      allow read, write: if true;
    }
    
    // Real-time data sync
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

   - Klik **"Publish"**

⚠️ **NOTE:** Rules ini open untuk development. Untuk production, implement proper authentication.

---

### C. Get Firebase Configuration

1. **Get Config:**
   - Klik **⚙️ (Settings icon)** di sidebar
   - Pilih **"Project settings"**
   - Scroll ke **"Your apps"**
   - Klik icon **Web** (`</>`)

2. **Register App:**
   - App nickname: `Surat Jalan Monitor`
   - **JANGAN** centang "Also set up Firebase Hosting"
   - Klik **"Register app"**

3. **Copy Firebase Config:**
   
   Akan muncul config seperti ini:
   
```javascript
const firebaseConfig = {
  apiKey: "AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  authDomain: "surat-jalan-xxxxx.firebaseapp.com",
  projectId: "surat-jalan-xxxxx",
  storageBucket: "surat-jalan-xxxxx.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abc123def456"
};
```

   **📋 COPY SEMUA CONFIG INI!** Simpan di Notepad sementara.

4. **Klik "Continue to console"**

---

## 🎯 LANGKAH 2: SETUP HOSTING

### A. Enable Firebase Hosting

1. **Navigate to Hosting:**
   - Sidebar → **Build** → **Hosting**
   - Klik **"Get started"**

2. **Follow Wizard:**
   - Step 1: Install Firebase CLI → Klik "Next"
   - Step 2: Initialize project → Klik "Next"  
   - Step 3: Deploy → Klik "Finish"

---

## 🎯 LANGKAH 3: PREPARE FILES

### A. Extract Package

1. **Extract `firebase-deploy-firestore-package.tar.gz`**
   - Right-click → Extract here
   - Atau gunakan 7-Zip / WinRAR
   - Folder akan terbuat: `firebase-deploy-firestore/`

2. **Verify Structure:**
```
firebase-deploy-firestore/
├── public/
│   └── index.html
├── src/
│   ├── config/
│   │   └── firebase-config.js  ← CONFIG FILE
│   └── App.jsx
├── package.json
├── vite.config.js
├── firebase.json
├── .firebaserc
└── DEPLOYMENT_GUIDE.md (file ini)
```

---

### B. Configure Firebase

1. **Edit `src/config/firebase-config.js`:**
   - Buka dengan Notepad atau VS Code
   - Cari bagian:
   
```javascript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY_HERE",
  authDomain: "your-project-id.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project-id.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abc123def456"
};
```

   - **REPLACE** dengan config yang Anda copy dari Firebase Console!
   - **Save** file

2. **Edit `.firebaserc`:**
   - Buka dengan Notepad
   - Cari:
   
```json
{
  "projects": {
    "default": "your-project-id"
  }
}
```

   - Ganti `"your-project-id"` dengan **Project ID** Anda
   - **Save** file

---

## 🎯 LANGKAH 4: DEPLOY

### A. Install Firebase CLI

1. **Open Command Prompt:**
   - Win + R → ketik `cmd` → Enter

2. **Install Firebase Tools:**
```bash
npm install -g firebase-tools
```

   Tunggu ~2-5 menit sampai selesai.

3. **Verify Installation:**
```bash
firebase --version
```

   Harus muncul versi: `13.x.x` atau lebih tinggi

---

### B. Login Firebase

```bash
firebase login
```

- Browser akan terbuka
- Login dengan Google Account yang sama
- Klik "Allow"
- Kembali ke Command Prompt
- Harus muncul: "Success! Logged in as your-email@gmail.com"

---

### C. Build & Deploy

1. **Navigate to Project Folder:**
```bash
cd C:\path\to\firebase-deploy-firestore
```

   Contoh:
```bash
cd C:\Users\m3m3i\Downloads\firebase-deploy-firestore
```

2. **Install Dependencies:**
```bash
npm install
```

   Tunggu ~3-5 menit (download Firebase SDK + dependencies)

3. **Build Application:**
```bash
npm run build
```

   Tunggu ~1-2 menit
   
   Output sukses:
```
✓ built in 45s
dist/index.html                   1.2 kB
dist/assets/index-abc123.js     456.7 kB
```

4. **Deploy to Firebase:**
```bash
firebase deploy --only hosting
```

   Tunggu ~1-2 menit
   
   Output sukses:
```
✔  Deploy complete!

Project Console: https://console.firebase.google.com/project/surat-jalan-xxxxx
Hosting URL: https://surat-jalan-xxxxx.web.app
```

5. **COPY HOSTING URL!**

---

## 🎯 LANGKAH 5: TEST APLIKASI

### A. Open Application

1. **Buka Hosting URL di browser:**
   ```
   https://surat-jalan-xxxxx.web.app
   ```

2. **Halaman Login harus muncul**

---

### B. Login

**Default Accounts:**

```
Super Admin:
Username: admin
Password: admin123

Staff SJ:
Username: staff
Password: staff123

Admin Keuangan:
Username: keuangan
Password: keuangan123
```

---

### C. Test Features

✅ **Test Multi-User Sync:**

1. **Open 2 browser windows** (atau 2 device berbeda)
2. **Login di kedua window** (bisa dengan user berbeda)
3. **Window 1:** Buat Surat Jalan baru
4. **Window 2:** Refresh page → Surat Jalan yang baru HARUS MUNCUL! ✅
5. **Ini bukti real-time sync bekerja!**

✅ **Test Audit Log:**

1. **Login sebagai Super Admin**
2. **Buat Surat Jalan**
3. **Check Firestore Console:**
   - Firebase Console → Firestore Database
   - Collection: `audit-logs`
   - Harus ada log baru dengan:
     - action: "create"
     - entityType: "surat-jalan"
     - user: { name, role, username }
     - timestamp

✅ **Test Export Excel:**

1. **Tab Surat Jalan** → Export CSV
2. **Tab Keuangan** → Export CSV
3. **Tab Invoice** → Export Excel per invoice
4. File harus ter-download dan bisa dibuka di Excel

✅ **Test Offline Mode:**

1. **Disconnect internet** (Airplane mode)
2. **Create Surat Jalan** → Harus bisa (tersimpan local)
3. **Connect internet** kembali
4. **Data otomatis sync** ke cloud ✅

---

## 🎯 LANGKAH 6: SETUP USERS

### A. Change Default Passwords

⚠️ **PENTING:** Ganti password default sebelum share ke team!

1. **Login sebagai Super Admin**
2. **Tab "Kelola User"**
3. **Edit setiap user** → Ganti password
4. **Save**

---

### B. Create New Users

1. **Tab "Kelola User"**
2. **"+ Tambah User"**
3. **Fill data:**
   - Username
   - Password
   - Nama Lengkap
   - Role (pilih sesuai kebutuhan)
4. **Save**

---

## 🎯 LANGKAH 7: SHARE TO TEAM

### A. Share URL

```
Aplikasi Surat Jalan Monitor

URL: https://surat-jalan-xxxxx.web.app

Login:
Username: [yang sudah dibuat]
Password: [yang sudah dibuat]

Fitur:
✅ Multi-user real-time sync
✅ Akses dari HP/tablet/laptop
✅ Export Excel
✅ Online 24/7
✅ Offline support
```

---

### B. User Guide (Kirim ke Team)

**Cara Akses:**
1. Buka browser (Chrome/Firefox/Safari)
2. Buka URL: `https://surat-jalan-xxxxx.web.app`
3. Login dengan username & password
4. Dashboard muncul

**Tips:**
- Bookmark URL untuk akses cepat
- Data otomatis sync - tidak perlu refresh
- Bisa akses dari HP juga (responsive)
- Bisa kerja offline, sync saat online lagi

---

## 📊 MONITORING & MAINTENANCE

### A. Monitor Firestore Usage

1. **Firebase Console** → **Firestore Database**
2. **Tab "Usage"**
3. Check:
   - Reads per day
   - Writes per day
   - Storage used

**Free Tier Limits:**
- 50,000 reads/day
- 20,000 writes/day
- 1 GB storage
- Cukup untuk ~50 active users

---

### B. View Audit Logs

1. **Firestore Console**
2. **Collection: `audit-logs`**
3. **Sort by timestamp** (newest first)
4. **Check logs:**
   - Who created what
   - Who updated what
   - When it happened

---

### C. Backup Data

**Manual Backup:**

1. **Tab Surat Jalan** → Export CSV → Save
2. **Tab Keuangan** → Export CSV → Save
3. **Tab Invoice** → Export setiap invoice → Save
4. **Store backups** di Google Drive / OneDrive

**Auto Backup (Advanced):**
- Setup Cloud Functions untuk daily backup
- Export ke Cloud Storage
- (Optional - butuh setup tambahan)

---

## 🔄 UPDATE APPLICATION

Jika ada update di masa depan:

```bash
# 1. Get new files (App.jsx, dll)
# 2. Replace di folder src/

# 3. Rebuild
npm run build

# 4. Redeploy
firebase deploy --only hosting

# 5. Done! Update langsung live
# Semua user otomatis dapat update saat refresh
```

---

## 🔒 SECURITY (Production Hardening)

### A. Update Firestore Rules

Untuk production, update rules di Firestore:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Require authentication (implement Firebase Auth)
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

### B. Enable Firebase Authentication (Optional)

1. **Firebase Console** → **Authentication**
2. **Get started**
3. **Enable Email/Password**
4. **Create users** di console
5. **Update app** untuk gunakan Firebase Auth
6. **(Saya bisa bantu jika perlu!)**

---

## 🆘 TROUBLESHOOTING

### Error: "Permission denied"

**Cause:** Firestore rules terlalu restrictive
**Fix:**
1. Firestore Console → Rules
2. Pastikan ada `allow read, write: if true;`
3. Publish

---

### Error: "Firebase config not found"

**Cause:** `firebase-config.js` belum di-update
**Fix:**
1. Edit `src/config/firebase-config.js`
2. Paste config dari Firebase Console
3. Save & rebuild

---

### Data tidak sync

**Cause:** Multiple tabs atau offline
**Fix:**
1. Close semua tabs
2. Open 1 tab saja
3. Refresh
4. Check internet connection

---

### Build error

**Fix:**
```bash
# Clear & reinstall
rmdir /s node_modules
del package-lock.json
npm install
npm run build
```

---

## 📞 SUPPORT

Jika ada masalah atau pertanyaan:

1. Check troubleshooting section di atas
2. Check browser console (F12) untuk error
3. Check Firestore Console untuk data
4. Tanya saya! Saya tetap bisa bantu revisi & fix bugs! ✅

---

## ✅ VERIFICATION CHECKLIST

Setup Complete jika:

- [ ] Firebase project created
- [ ] Firestore enabled (region: Singapore)
- [ ] Firestore rules published
- [ ] Firebase config updated di `firebase-config.js`
- [ ] Project ID updated di `.firebaserc`
- [ ] `npm install` sukses
- [ ] `npm run build` sukses
- [ ] `firebase deploy` sukses
- [ ] App accessible via Hosting URL
- [ ] Login berhasil
- [ ] Create Surat Jalan berhasil
- [ ] Data muncul di Firestore Console
- [ ] Audit log tersimpan di Firestore
- [ ] Multi-user sync bekerja (test 2 windows)
- [ ] Export Excel berfungsi
- [ ] Offline mode bekerja

---

## 🎉 SELAMAT!

Aplikasi Surat Jalan Monitor dengan **Multi-User Real-Time Sync** sudah **LIVE**! 🚀

Team Anda sekarang bisa:
- ✅ Akses dari mana saja
- ✅ Data sync real-time
- ✅ Track semua aktivitas via audit log
- ✅ Export data ke Excel
- ✅ Kerja offline, sync otomatis

**Enjoy! 🎊**

---

**Version:** 2.0.0-firestore
**Last Updated:** 2024
**Support:** Available for revisions & bug fixes!
