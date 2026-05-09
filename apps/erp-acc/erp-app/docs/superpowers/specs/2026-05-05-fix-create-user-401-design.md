# Design: Fix Tambah User — 401 Unauthorized

**Tanggal:** 2026-05-05  
**Status:** Approved  
**Scope:** Minimal fix — 1 file, tidak perlu redeploy Edge Function

---

## Latar Belakang

Fitur "Tambah User" di Settings → Users gagal dengan error 401 setiap kali tombol "Buat User" diklik. Pesan yang muncul: `"Gagal membuat user: Edge Function returned a non-2xx status code"`.

### Root Cause (dikonfirmasi via Supabase logs)

`supabase.functions.invoke()` **tidak otomatis menyertakan session JWT** dalam Authorization header, meskipun user sudah login. Akibatnya:

- **Percobaan 1 (1.214ms):** Anon key dikirim → gateway Supabase lolos, tapi `auth.getUser(anonKey)` di dalam Edge Function gagal → 401 "Invalid or expired session"
- **Percobaan 2-3 (44–49ms):** Header Authorization kosong/invalid → gateway langsung reject → 401

Edge Function `create-user` sendiri sudah benar. Tidak perlu diubah atau di-redeploy.

### Bug Kedua (ditemukan bersamaan)

Error spesifik dari Edge Function (mis. `"Email sudah terdaftar"`) tidak ditampilkan ke user. Hanya pesan generic `"Edge Function returned a non-2xx status code"` yang muncul, karena `error.context?.json?.()` tidak reliable untuk semua response type.

---

## Solusi

### File yang diubah: `src/services/userService.js`

Hanya fungsi `createUser()` yang dimodifikasi — dua bagian:

#### 1. Ambil session sebelum invoke

```js
const { data: { session } } = await supabase.auth.getSession()
if (!session) {
  throw new Error('Sesi tidak aktif. Silakan login ulang.')
}

const result = await supabase.functions.invoke('create-user', {
  body: { email, password, full_name, role },
  headers: { Authorization: `Bearer ${session.access_token}` },
  signal: controller.signal,
})
```

**Mengapa explicit header?** `functions.invoke()` seharusnya auto-include token, tapi versi `@supabase/supabase-js` yang dipakai tidak melakukan ini secara konsisten. Explicit header memastikan token user selalu dikirim.

#### 2. Perbaiki error message extraction

```js
if (error) {
  let message = error.message
  try {
    if (error.context) {
      const body = await error.context.json()
      if (body?.error) message = body.error
      else if (body?.message) message = body.message
    }
  } catch { /* fallback ke generic message */ }
  throw new Error(message)
}
```

**Mengapa perlu difix?** Pattern lama `error.context?.json?.()` tidak reliable — untuk gateway-level 401, response body bukan JSON atau `context` undefined. Pattern baru handles kedua kasus.

---

## Yang Tidak Berubah

| Komponen | Status |
|---|---|
| `supabase/functions/create-user/index.ts` | Tidak diubah |
| `src/pages/settings/UsersPage.jsx` | Tidak diubah |
| Supabase Edge Function deployment | Tidak perlu redeploy |
| Database / migrasi | Tidak ada |

---

## Manual Test Plan

1. Login sebagai admin (Manfred Gunardi)
2. Buka Settings → Users
3. Klik "+ Tambah User"
4. Isi: email baru (mis. `test.user@example.com`), password `Test@123`, nama `Test User`, role `Staff`
5. Klik "Buat User" → **harus sukses**, user baru muncul di list
6. Logout → login sebagai user baru → verifikasi role = Staff
7. Deactivate user test setelah selesai

### Error cases yang harus ditampilkan dengan benar setelah fix:
- Email sudah terdaftar → pesan dari Edge Function: `"email address already in use"`
- User bukan admin → `"Forbidden: admin role required"`
- Sesi expired / tidak login → `"Sesi tidak aktif. Silakan login ulang."`

---

## Model & Effort

| Task | Model | Alasan |
|---|---|---|
| Edit `userService.js` | Haiku | Perubahan deterministik, tidak ada logika baru |
| Verifikasi build | Haiku | `npm run build` — cek kompilasi |
| Manual test (dilakukan user) | — | Tidak bisa diotomasi tanpa Playwright session |
