# RBAC Hardening (Firebase Auth + Custom Claims)

## 1) Enable Auth
Firebase Console → Authentication → Sign-in method → **Email/Password ON**.

## 2) Deploy Firestore Rules
```bash
firebase deploy --only firestore
```

## 3) Deploy Functions (role management)
```bash
cd functions
npm i
cd ..
firebase deploy --only functions
```

## 4) Create first Superadmin
Cara termudah:
1. Buat user Auth manual di Firebase Console (email/password)
2. Jalankan `setUserRole` via Admin SDK/temporary script, atau buat 1 kali lewat Cloud Function dengan role superadmin (Anda bisa set manual via Firebase Admin SDK di lokal).

## 5) Login di App
Login form menerima:
- email langsung, atau
- username (akan dipetakan menjadi `username@app.local`)

Role dibaca dari custom claim `token.role`.

## 6) Catatan
- Tanpa deploy functions, fitur tambah user dari UI akan fallback (DEV mode) dan **tidak hardened**.
- Untuk produksi, deploy functions dan gunakan `createUserWithRole`.
