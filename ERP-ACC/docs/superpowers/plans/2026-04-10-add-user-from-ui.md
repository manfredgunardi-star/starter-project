# Add User from Settings UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin dapat membuat user baru (email, password, nama, role) langsung dari halaman Settings → Users tanpa harus membuka Supabase Dashboard.

**Architecture:** Supabase Edge Function `create-user` dijalankan dengan `service_role` key untuk memanggil `supabase.auth.admin.createUser()`, lalu mengupdate kolom `role` di tabel `profiles`. Frontend memanggil Edge Function via `supabase.functions.invoke()` dari form modal di `UsersPage`. Caller's JWT diverifikasi di Edge Function untuk memastikan hanya admin aktif yang boleh membuat user.

**Tech Stack:** React 18, Vite, Supabase (Auth + PostgREST + Edge Functions/Deno+TypeScript), Tailwind CSS.

**Project has no test framework** (per CLAUDE.md). Validation dilakukan manual via browser + Supabase Dashboard, bukan automated tests.

**Prerequisites:**
- Supabase project sudah berjalan (sama seperti untuk migration 001–013).
- Current user yang akan testing sudah punya role `admin` di tabel `profiles`.

---

## File Structure

Files yang akan dibuat / dimodifikasi:

| File | Jenis | Tanggung jawab |
|---|---|---|
| `erp-app/supabase/functions/create-user/index.ts` | Create | Edge Function source code (version-controlled). Verifikasi auth, validasi input, panggil `auth.admin.createUser`, update `profiles.role`. |
| `erp-app/src/services/userService.js` | Modify | Tambah `createUser()` — invoke Edge Function dengan body `{ email, password, full_name, role }`. |
| `erp-app/src/pages/settings/UsersPage.jsx` | Modify | Tambah komponen `CreateUserForm`, tombol "+ Tambah User", state `creatingUser`, handler `handleCreate`. |

Tidak ada file yang dihapus. Tidak ada perubahan schema SQL.

---

## Task 1: Create Edge Function source file

**Goal:** Menulis file source Edge Function yang akan di-deploy ke Supabase. File ini di-commit ke git sebagai source of truth sehingga dapat di-redeploy kapan saja.

**Files:**
- Create: `erp-app/supabase/functions/create-user/index.ts`

**Catatan konteks:**
- Edge Function dijalankan di runtime Deno (bukan Node).
- `SUPABASE_URL` dan `SUPABASE_SERVICE_ROLE_KEY` tersedia otomatis sebagai env var di dalam Supabase Edge Functions (tidak perlu kita setting manual).
- Trigger `handle_new_user` (migration 001) otomatis membuat row di `profiles` dengan role default `'viewer'` dan full_name dari `user_metadata`. Edge Function hanya perlu `update` role setelah user dibuat.
- Self-protection: bila update role gagal, kita rollback dengan menghapus auth user yang baru dibuat supaya tidak ada orphan.

- [ ] **Step 1: Buat direktori dan file kosong**

Pastikan direktori `erp-app/supabase/functions/create-user/` ada, lalu create `index.ts`.

- [ ] **Step 2: Tulis isi Edge Function**

File: `erp-app/supabase/functions/create-user/index.ts`

```typescript
// Edge Function: create-user
// Creates a new Supabase auth user and sets their role in profiles.
// Only callable by authenticated admin users.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const VALID_ROLES = ['admin', 'staff', 'viewer']

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  try {
    // 1. Extract JWT from Authorization header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return jsonResponse({ error: 'Missing authorization header' }, 401)
    }
    const token = authHeader.replace('Bearer ', '')

    // 2. Create admin client using service role key
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ error: 'Server misconfigured: missing env vars' }, 500)
    }
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)

    // 3. Verify caller's JWT and get their user record
    const { data: callerData, error: callerErr } = await supabaseAdmin.auth.getUser(token)
    if (callerErr || !callerData?.user) {
      return jsonResponse({ error: 'Invalid or expired session' }, 401)
    }
    const caller = callerData.user

    // 4. Check caller is an active admin
    const { data: callerProfile, error: profileErr } = await supabaseAdmin
      .from('profiles')
      .select('role, is_active')
      .eq('id', caller.id)
      .single()

    if (profileErr || !callerProfile) {
      return jsonResponse({ error: 'Caller profile not found' }, 403)
    }
    if (callerProfile.role !== 'admin' || !callerProfile.is_active) {
      return jsonResponse({ error: 'Forbidden: admin role required' }, 403)
    }

    // 5. Parse and validate request body
    let body: { email?: string; password?: string; full_name?: string; role?: string }
    try {
      body = await req.json()
    } catch {
      return jsonResponse({ error: 'Invalid JSON body' }, 400)
    }

    const email = (body.email ?? '').trim()
    const password = body.password ?? ''
    const full_name = (body.full_name ?? '').trim()
    const role = body.role ?? ''

    if (!email) return jsonResponse({ error: 'Email wajib diisi' }, 400)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return jsonResponse({ error: 'Format email tidak valid' }, 400)
    }
    if (password.length < 6) {
      return jsonResponse({ error: 'Password minimal 6 karakter' }, 400)
    }
    if (!full_name) return jsonResponse({ error: 'Nama lengkap wajib diisi' }, 400)
    if (!VALID_ROLES.includes(role)) {
      return jsonResponse({ error: 'Role harus admin, staff, atau viewer' }, 400)
    }

    // 6. Create auth user (email_confirm: true → skip email verification)
    const { data: createdData, error: createErr } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name },
      })

    if (createErr || !createdData?.user) {
      return jsonResponse(
        { error: createErr?.message ?? 'Gagal membuat user' },
        400,
      )
    }
    const newUserId = createdData.user.id

    // 7. Update profile with the requested role
    //    (handle_new_user trigger already created the row with default role 'viewer')
    const { error: updateErr } = await supabaseAdmin
      .from('profiles')
      .update({ full_name, role })
      .eq('id', newUserId)

    if (updateErr) {
      // Rollback: delete the auth user to avoid orphaned accounts
      await supabaseAdmin.auth.admin.deleteUser(newUserId)
      return jsonResponse(
        { error: 'Gagal set role user: ' + updateErr.message },
        500,
      )
    }

    // 8. Success
    return jsonResponse(
      {
        success: true,
        user: {
          id: newUserId,
          email,
          full_name,
          role,
        },
      },
      200,
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return jsonResponse({ error: message }, 500)
  }
})
```

- [ ] **Step 3: Commit**

```bash
cd C:/Project/ERP-ACC
git add erp-app/supabase/functions/create-user/index.ts
git commit -m "feat: add create-user edge function source"
```

---

## Task 2: Deploy Edge Function via Supabase Dashboard

**Goal:** Men-deploy Edge Function ke Supabase project sehingga bisa dipanggil dari frontend. Karena user tidak punya Supabase CLI terinstall, kita pakai Dashboard UI.

**Files:** (tidak ada file yang diubah — ini deployment langkah manual)

- [ ] **Step 1: Buka Supabase Dashboard**

Buka https://app.supabase.com → pilih project ERP → klik menu **Edge Functions** di sidebar kiri.

- [ ] **Step 2: Klik "Deploy a new function"**

Klik tombol **"Deploy a new function"** (atau **"Create a new function"**) di pojok kanan atas. Bila Supabase menanyakan nama function, isi: `create-user`.

- [ ] **Step 3: Paste source code**

Di editor Dashboard, hapus semua code template yang muncul. Kemudian paste **seluruh isi** file `erp-app/supabase/functions/create-user/index.ts` yang sudah dibuat di Task 1.

- [ ] **Step 4: Deploy**

Klik tombol **"Deploy function"** (atau **"Save & Deploy"**). Tunggu sampai muncul status **"Deployed"** / hijau.

Expected: Function `create-user` muncul di list Edge Functions dengan status active, ada endpoint URL berbentuk `https://<project-ref>.supabase.co/functions/v1/create-user`.

- [ ] **Step 5: Verify dari Dashboard Logs**

Klik function `create-user` → tab **Logs**. Belum ada log (karena belum dipanggil) — pastikan tidak ada error parsing/syntax. Jika ada error, cek ulang paste-an code.

- [ ] **Step 6: Smoke test via curl (optional tapi disarankan)**

Buka terminal di lokal. Test bahwa function merespon dan menolak request tanpa auth:

```bash
curl -i -X POST "https://<project-ref>.supabase.co/functions/v1/create-user" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Expected: HTTP 401 dengan body `{"error":"Missing authorization header"}`.

Ganti `<project-ref>` dengan ref asli project Anda (terlihat di URL Dashboard).

---

## Task 3: Add `createUser()` to userService.js

**Goal:** Menambahkan service function di frontend yang memanggil Edge Function.

**Files:**
- Modify: `erp-app/src/services/userService.js`

**Catatan:** `supabase.functions.invoke()` otomatis attach JWT dari session aktif ke header `Authorization`. Tidak perlu kita manual ambil token.

- [ ] **Step 1: Tambahkan fungsi `createUser` di akhir file**

Tambahkan function berikut **setelah** function `reactivateUser` di `erp-app/src/services/userService.js` (baris 73, setelah tutup kurung `}`):

```javascript
export async function createUser({ email, password, full_name, role }) {
  const { data, error } = await supabase.functions.invoke('create-user', {
    body: { email, password, full_name, role },
  })

  // Two error paths:
  // 1. Network / invocation error → `error` is set
  // 2. Edge function returned 4xx/5xx → `data` contains `{ error: "..." }`
  if (error) {
    // Try to extract the JSON body which contains our custom error message
    let message = error.message
    try {
      const ctx = await error.context?.json?.()
      if (ctx?.error) message = ctx.error
    } catch {
      // ignore, fall back to generic message
    }
    throw new Error(message)
  }
  if (data?.error) {
    throw new Error(data.error)
  }
  return data?.user
}
```

- [ ] **Step 2: Verify build masih lulus**

```bash
cd C:/Project/ERP-ACC/erp-app && npm run build
```

Expected: Build succeeded tanpa error. Bundle size output ditampilkan.

- [ ] **Step 3: Commit**

```bash
cd C:/Project/ERP-ACC
git add erp-app/src/services/userService.js
git commit -m "feat: add createUser service calling create-user edge function"
```

---

## Task 4: Add `CreateUserForm` component in UsersPage

**Goal:** Menambahkan komponen form React untuk membuat user baru — field email, password (dengan tombol generate), nama lengkap, dan dropdown role dengan penjelasan.

**Files:**
- Modify: `erp-app/src/pages/settings/UsersPage.jsx`

- [ ] **Step 1: Update import**

Di `erp-app/src/pages/settings/UsersPage.jsx` line 2, ubah import dari `userService` untuk menambahkan `createUser`:

Ganti:
```javascript
import { getUsers, updateUserProfile, deactivateUser, reactivateUser } from '../../services/userService'
```

Menjadi:
```javascript
import { getUsers, createUser, updateUserProfile, deactivateUser, reactivateUser } from '../../services/userService'
```

Lalu pada line 7, ubah import lucide-react untuk menambahkan `Plus`:

Ganti:
```javascript
import { Edit2, Trash2, RotateCcw } from 'lucide-react'
```

Menjadi:
```javascript
import { Edit2, Trash2, RotateCcw, Plus } from 'lucide-react'
```

- [ ] **Step 2: Tambahkan komponen `CreateUserForm`**

Setelah komponen `UserForm` selesai (setelah baris `}` di akhir `UserForm`, yaitu line 69), **sebelum** komponen `UserRow`, tambahkan:

```javascript
function CreateUserForm({ onSave, onCancel, isSaving, onError }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState('viewer')

  const generatePassword = () => {
    // Exclude ambiguous chars: 0/O, 1/l/I
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
    let p = ''
    for (let i = 0; i < 10; i++) {
      p += chars[Math.floor(Math.random() * chars.length)]
    }
    setPassword(p)
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    const trimmedEmail = email.trim()
    const trimmedName = fullName.trim()

    if (!trimmedEmail) {
      onError('Email tidak boleh kosong')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      onError('Format email tidak valid')
      return
    }
    if (password.length < 6) {
      onError('Password minimal 6 karakter')
      return
    }
    if (!trimmedName) {
      onError('Nama lengkap tidak boleh kosong')
      return
    }

    onSave({
      email: trimmedEmail,
      password,
      full_name: trimmedName,
      role,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          disabled={isSaving}
          placeholder="user@contoh.com"
          autoComplete="off"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Password Sementara
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono"
            disabled={isSaving}
            placeholder="Minimal 6 karakter"
            autoComplete="new-password"
          />
          <Button
            type="button"
            variant="secondary"
            onClick={generatePassword}
            disabled={isSaving}
          >
            Generate
          </Button>
        </div>
        <p className="text-xs text-gray-500 mt-1">
          Berikan password ini kepada user. Mereka dapat mengubahnya setelah login.
        </p>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Nama Lengkap</label>
        <input
          type="text"
          value={fullName}
          onChange={e => setFullName(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          disabled={isSaving}
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
        <select
          value={role}
          onChange={e => setRole(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          disabled={isSaving}
        >
          <option value="viewer">Viewer — hanya bisa melihat data</option>
          <option value="staff">Staff — bisa input & edit transaksi</option>
          <option value="admin">Admin — akses penuh termasuk manajemen user</option>
        </select>
        <div className="mt-2 text-xs text-gray-600 bg-blue-50 border border-blue-100 rounded p-2 space-y-1">
          <p><strong>Viewer:</strong> read-only. Bisa lihat semua data & laporan.</p>
          <p><strong>Staff:</strong> bisa input transaksi (PO, invoice, payment, dll).</p>
          <p><strong>Admin:</strong> akses penuh + manajemen user + audit log.</p>
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="submit" variant="primary" loading={isSaving}>
          Buat User
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={isSaving}>
          Batal
        </Button>
      </div>
    </form>
  )
}
```

- [ ] **Step 3: Verify build lulus**

```bash
cd C:/Project/ERP-ACC/erp-app && npm run build
```

Expected: Build succeeded. Tidak ada warning unused import `Plus` karena akan kita pakai di Task 5.

Kalau build error "Plus is defined but never used" (eslint / rollup), abaikan — tidak fatal. Akan terpakai di Task 5.

---

## Task 5: Wire up "Tambah User" button & handler in UsersPage

**Goal:** Menampilkan tombol "+ Tambah User", state management untuk form create, dan handler yang memanggil `createUser`.

**Files:**
- Modify: `erp-app/src/pages/settings/UsersPage.jsx`

- [ ] **Step 1: Tambah state `creatingUser`**

Di dalam komponen `UsersPage`, setelah baris:
```javascript
const [editingUser, setEditingUser] = useState(null)
```

Tambahkan:
```javascript
const [creatingUser, setCreatingUser] = useState(false)
```

- [ ] **Step 2: Tambah handler `handleCreate`**

Setelah function `handleSave` (yaitu setelah baris `}` yang menutup `handleSave`, sekitar line 163), tambahkan:

```javascript
const handleCreate = async ({ email, password, full_name, role }) => {
  setIsSaving(true)
  try {
    await createUser({ email, password, full_name, role })
    toast.success(`User ${email} berhasil dibuat`)
    setCreatingUser(false)
    await loadUsers()
  } catch (err) {
    toast.error('Gagal membuat user: ' + err.message)
  } finally {
    setIsSaving(false)
  }
}
```

- [ ] **Step 3: Ganti header `<h1>` dengan header + tombol**

Ganti baris:
```javascript
<h1 className="text-3xl font-bold text-gray-900">Manajemen Users</h1>
```

Menjadi:
```javascript
<div className="flex justify-between items-center">
  <h1 className="text-3xl font-bold text-gray-900">Manajemen Users</h1>
  {!creatingUser && !editingUser && (
    <Button
      variant="primary"
      onClick={() => setCreatingUser(true)}
    >
      <Plus size={16} className="inline mr-1" />
      Tambah User
    </Button>
  )}
</div>
```

- [ ] **Step 4: Render `CreateUserForm` di atas form edit**

**Sebelum** block `{editingUser && (...)}`, tambahkan block berikut:

```javascript
{creatingUser && (
  <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
    <h2 className="text-lg font-semibold text-gray-900 mb-4">Tambah User Baru</h2>
    <CreateUserForm
      onSave={handleCreate}
      onCancel={() => setCreatingUser(false)}
      isSaving={isSaving}
      onError={(msg) => toast.error(msg)}
    />
  </div>
)}
```

- [ ] **Step 5: Verify build lulus**

```bash
cd C:/Project/ERP-ACC/erp-app && npm run build
```

Expected: Build succeeded tanpa error maupun warning.

- [ ] **Step 6: Commit**

```bash
cd C:/Project/ERP-ACC
git add erp-app/src/pages/settings/UsersPage.jsx
git commit -m "feat: add create user form to users settings page"
```

---

## Task 6: End-to-end manual testing

**Goal:** Verifikasi fitur bekerja di browser — skenario sukses & skenario gagal.

**Files:** (no changes — testing only)

**Prerequisites untuk testing:**
- User yang sedang login saat ini harus punya role `admin`. Cek via Supabase Dashboard → Table Editor → `profiles` → cari row dengan id Anda → pastikan `role = 'admin'` dan `is_active = true`.

- [ ] **Step 1: Start dev server**

```bash
cd C:/Project/ERP-ACC/erp-app && npm run dev
```

Buka http://localhost:5173 dan login sebagai admin.

- [ ] **Step 2: Test skenario sukses — buat user viewer baru**

1. Navigate: Settings → Users
2. Klik tombol **"+ Tambah User"** di pojok kanan atas
3. Isi form:
   - Email: `testviewer@contoh.com`
   - Klik **Generate** → password ter-isi otomatis
   - Nama Lengkap: `Test Viewer`
   - Role: `Viewer`
4. Klik **"Buat User"**

Expected:
- Toast hijau: `User testviewer@contoh.com berhasil dibuat`
- Form tertutup
- Table user di-refresh, row baru `Test Viewer` muncul dengan badge role **Viewer** dan status **Aktif**

Verify di Supabase Dashboard:
- Authentication → Users → ada user baru dengan email `testviewer@contoh.com`
- Table Editor → `profiles` → ada row baru dengan role `viewer`

- [ ] **Step 3: Test skenario sukses — buat user staff**

Ulang step 2 dengan:
- Email: `teststaff@contoh.com`
- Nama: `Test Staff`
- Role: `Staff`

Expected: sama seperti step 2 tapi badge role **Staff**.

- [ ] **Step 4: Test validasi — email duplikat**

Klik **"+ Tambah User"** lagi dan isi email yang sama dengan user yang sudah ada (misalnya `testviewer@contoh.com`), lengkapi field lain, klik **Buat User**.

Expected: Toast merah dengan pesan error dari Supabase seperti `Gagal membuat user: User already registered` atau semisalnya. Form tetap terbuka. Table tidak berubah.

- [ ] **Step 5: Test validasi — email format invalid**

Isi email `bukan-email`, lengkapi field lain, klik **Buat User**.

Expected: Toast merah `Format email tidak valid`. Request tidak pernah dikirim (validasi client-side).

- [ ] **Step 6: Test validasi — password terlalu pendek**

Isi password `abc`, lengkapi field lain, klik **Buat User**.

Expected: Toast merah `Password minimal 6 karakter`.

- [ ] **Step 7: Test authorization — non-admin tidak bisa**

1. Logout
2. Login sebagai user dengan role `viewer` atau `staff` (jika ada; kalau tidak, skip test ini atau update role sementara di Dashboard)
3. Navigate ke Settings → Users (kalau halaman bisa dibuka) atau coba panggil endpoint langsung via browser console:

```javascript
const { data, error } = await window.supabase.functions.invoke('create-user', {
  body: { email: 'hack@contoh.com', password: 'abcdef', full_name: 'Hack', role: 'admin' }
})
console.log({ data, error })
```

Expected: Error `Forbidden: admin role required`. Bila `window.supabase` tidak ada, test ini dilewati — yang penting sudah dicover di Edge Function logic.

Login kembali sebagai admin.

- [ ] **Step 8: Test login user baru**

Logout dari akun admin. Login pakai `testviewer@contoh.com` + password yang di-generate tadi.

Expected: Login sukses. User landing di halaman dashboard. Navigasi ke menu-menu yang membaca data bekerja normal.

Logout dan login kembali sebagai admin.

- [ ] **Step 9: Cleanup test users (optional)**

Kembali ke Settings → Users, klik icon trash di row `testviewer` dan `teststaff` untuk deactivate keduanya.

(Alternatif: hapus dari Supabase Dashboard → Authentication → Users → klik user → Delete.)

- [ ] **Step 10: Catat hasil testing**

Tulis di commit message berikutnya atau note: "Manual E2E test passed: create user, duplicate email handling, validation, login as new user."

---

## Task 7: Deploy ke Vercel

**Goal:** Push perubahan frontend ke production.

**Files:** (no changes — deployment)

**Catatan:** Edge Function sudah di-deploy di Task 2 dan berjalan independen dari frontend. Task ini hanya deploy frontend yang memanggil Edge Function.

- [ ] **Step 1: Pastikan semua sudah di-commit**

```bash
cd C:/Project/ERP-ACC && git status
```

Expected: `nothing to commit, working tree clean` — atau hanya file yang memang belum relevan.

- [ ] **Step 2: Push ke GitHub**

```bash
cd C:/Project/ERP-ACC && git push origin main
```

Kalau diminta credential, gunakan Personal Access Token GitHub (sama seperti deployment sebelumnya). **Revoke token setelah selesai push** untuk keamanan.

Expected: Push berhasil, tidak ada error.

- [ ] **Step 3: Tunggu Vercel auto-deploy**

Buka https://vercel.com → project Anda → tab **Deployments**. Tunggu build terbaru selesai (status **Ready**).

Expected: Build hijau, tidak ada error.

- [ ] **Step 4: Smoke test di production URL**

Buka URL Vercel (misalnya `starter-project-lemon.vercel.app`), login sebagai admin, test **"+ Tambah User"** sekali dengan user dummy. Verifikasi muncul di list.

Cleanup: deactivate dummy user setelahnya.

- [ ] **Step 5: Report**

Kabari user bahwa fitur sudah live. Sertakan satu kalimat cara pakai: "Buka Settings → Users → klik '+ Tambah User' → isi form → klik Buat User."

---

## Notes / Trade-offs

- **Password masuk riwayat form:** Password sementara dimasukkan di field `type="text"` (bukan password) supaya admin bisa melihat & copy. Ini disengaja, bukan bug. Browser password manager tidak akan auto-save karena `autoComplete="new-password"`.
- **Email confirmation di-skip** via `email_confirm: true`. Jika nanti proyek membutuhkan verifikasi email, ubah ke `false` dan setup SMTP di Supabase.
- **Rollback protection:** Jika update role gagal setelah auth user dibuat, Edge Function akan menghapus auth user agar tidak ada orphan account. Risiko race condition minimal karena kedua operasi dilakukan berurutan dengan service role.
- **Audit log:** Operasi create user **tidak** tercatat di tabel `audit_logs` (migration 013) karena audit trigger hanya aktif di 7 tabel transaksi, bukan `profiles`. Bila ingin audit, tambahkan trigger `profiles` di migration baru — out of scope untuk plan ini.
- **Role RLS check di Edge Function vs database:** Edge function melakukan check admin secara eksplisit (langkah 4). Ini defense-in-depth — meskipun RLS policy "Admins can manage profiles" sudah melindungi tabel, auth.admin API **bypass RLS**, sehingga check eksplisit wajib.
