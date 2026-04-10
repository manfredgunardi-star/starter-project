# Invoice Harga Per Rute & Uang Muka Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-Rute pricing to invoice creation and a new "Uang Muka" (advance payment) tab that deducts from invoiced amounts, with deduction visibility in the SJ selection window.

**Architecture:** The invoice modal gets a new "Harga per Rute" section that appears after SJ selection, letting users set price-per-qty for each unique Rute. A new `uang_muka` Firestore collection stores advance payments linked to individual SJ. The SJ selection cards in the invoice modal show computed price and Uang Muka deductions. A new "Uang Muka" tab provides CRUD management for advance payments.

**Tech Stack:** React (existing), Firebase Firestore, Tailwind CSS (existing utility classes), lucide-react icons (existing)

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `firestore.rules` | Add `uang_muka` collection security rules |
| Modify | `src/App.jsx` | Add uang_muka state, listener, CRUD, tab nav, UangMukaManagement component, modify invoice logic & modal |

> **Note:** Following existing codebase patterns, all components live inside `App.jsx`. The `InvoiceManagement`, `KeuanganManagement`, etc. are all defined in this file. We follow the same convention for `UangMukaManagement`.

## Data Model

### Modified Invoice Document
```javascript
// Existing fields remain unchanged. New fields added:
{
  ...existingFields,
  ruteHarga: {                    // Map: rute name → price per qty
    "Jakarta - Surabaya": 150000,
    "Bandung - Cirebon": 120000
  },
  totalHarga: 12500000            // Sum of (qtyBongkar × ruteHarga[rute]) for all SJ
}
```

### New `uang_muka` Collection
```javascript
{
  id: 'UM-' + Date.now(),
  sjId: string,                   // Which SJ this advance payment is for
  nomorSJ: string,                // Denormalized for display
  jumlah: number,                 // Amount in IDR
  tanggal: string,                // Date (ISO string)
  keterangan: string,             // Notes/description
  isActive: boolean,
  createdAt: string,              // ISO timestamp
  createdBy: string,
  updatedAt: string,
  updatedBy: string
}
```

---

### Task 1: Add Firestore Rules for `uang_muka`

**Files:**
- Modify: `firestore.rules:111-121` (insert before invoice rules or after them)

- [ ] **Step 1: Add uang_muka collection rules**

In `firestore.rules`, add the following block after the `invoices` rule block (after line 121) and before the `biaya` block:

```javascript
    // --- UANG MUKA (Advance Payments) ---
    match /uang_muka/{id} {
      allow read: if signedIn();
      allow create, update: if isSuperAdmin() || isAdminInv();
      allow delete: if isSuperAdmin();
    }
```

This follows the same access pattern as `invoice` — readable by all signed-in users, writable by superadmin and admin_invoice.

- [ ] **Step 2: Verify rules file is valid**

Run: `cd sj-monitor && npx firebase-tools emulators:exec --only firestore "echo rules-ok" 2>&1 | tail -5`

If firebase emulator is not available, visually verify the rules file has no syntax errors (matching braces, correct indentation).

- [ ] **Step 3: Commit**

```bash
git add firestore.rules
git commit -m "feat: add Firestore security rules for uang_muka collection"
```

---

### Task 2: Add `uang_muka` State and Firestore Listener

**Files:**
- Modify: `src/App.jsx:1912-1920` (near the invoice listeners)

- [ ] **Step 1: Add uangMukaList state**

Near the existing state declarations (around line where `invoiceList` state is declared — search for `useState([])` declarations near the top of `SuratJalanMonitor`), add:

```javascript
const [uangMukaList, setUangMukaList] = useState([]);
```

- [ ] **Step 2: Add Firestore onSnapshot listener for uang_muka**

Inside the same `useEffect` that sets up the invoice listeners (around lines 1912-1920), add after the `unsubInvoiceLegacy` listener:

```javascript
const unsubUangMuka = onSnapshot(collection(db, "uang_muka"), (snap) => {
  const data = snap.docs
    .map((d) => {
      const row = d.data() || {};
      return { ...row, id: row.id || d.id };
    })
    .filter((x) => !x?.deletedAt && x?.isActive !== false);
  data.sort((a, b) => (new Date(b?.tanggal).getTime() || 0) - (new Date(a?.tanggal).getTime() || 0));
  setUangMukaList(data);
}, (err) => {
  console.warn('[subscription] uang_muka error:', err.code);
  setUangMukaList([]);
});
```

- [ ] **Step 3: Add cleanup for the listener**

In the same useEffect's cleanup return function (search for `return () => {` that unsubscribes the other listeners), add:

```javascript
unsubUangMuka();
```

- [ ] **Step 4: Verify no errors**

Run: `cd sj-monitor && npm run dev`
Expected: App loads without console errors. The uang_muka listener silently initializes with empty data.

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx
git commit -m "feat: add uangMukaList state and Firestore listener"
```

---

### Task 3: Add Uang Muka CRUD Functions

**Files:**
- Modify: `src/App.jsx` (near the invoice CRUD functions, around lines 800-988)

- [ ] **Step 1: Add `addUangMuka` function**

After the `deleteInvoice` function (around line 988), add:

```javascript
const addUangMuka = async (data) => {
  const who = currentUser?.name || currentUser?.username || 'User';
  const nowIso = new Date().toISOString();
  const newUM = {
    id: 'UM-' + Date.now(),
    sjId: data.sjId,
    nomorSJ: data.nomorSJ,
    jumlah: parseFloat(data.jumlah),
    tanggal: data.tanggal,
    keterangan: data.keterangan || '',
    isActive: true,
    createdAt: nowIso,
    createdBy: who,
    updatedAt: nowIso,
    updatedBy: who,
  };

  try {
    await ensureAuthed();
    await setDoc(
      doc(db, 'uang_muka', String(newUM.id)),
      sanitizeForFirestore(newUM),
      { merge: true }
    );
    setUangMukaList((prev) => [newUM, ...prev]);
    setAlertMessage('✅ Uang Muka berhasil ditambahkan!');
  } catch (e) {
    console.error('Add uang muka failed:', e);
    if (e?.code === 'NOT_AUTHENTICATED') {
      setAlertMessage('⚠️ Sesi login habis. Silakan login ulang lalu coba lagi.');
    } else {
      setAlertMessage('⚠️ Gagal menyimpan Uang Muka. Cek Console (F12).');
    }
  }
};
```

- [ ] **Step 2: Add `deleteUangMuka` function**

Immediately after `addUangMuka`:

```javascript
const deleteUangMuka = async (id) => {
  setConfirmDialog({
    show: true,
    message: 'Yakin ingin menghapus Uang Muka ini?',
    onConfirm: async () => {
      try {
        await ensureAuthed();
        const nowIso = new Date().toISOString();
        const who = currentUser?.name || currentUser?.username || 'system';
        await setDoc(doc(db, 'uang_muka', String(id)), sanitizeForFirestore({
          isActive: false,
          deletedAt: nowIso,
          deletedBy: who,
          updatedAt: nowIso,
          updatedBy: who,
        }), { merge: true });
        setUangMukaList((prev) => prev.filter((um) => um.id !== id));
        setAlertMessage('✅ Uang Muka berhasil dihapus!');
      } catch (e) {
        console.error('Delete uang muka failed:', e);
        setAlertMessage('⚠️ Gagal menghapus Uang Muka. Cek Console (F12).');
      }
      setConfirmDialog({ show: false, message: '', onConfirm: null });
    },
  });
};
```

- [ ] **Step 3: Verify no syntax errors**

Run: `cd sj-monitor && npm run dev`
Expected: App compiles without errors.

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "feat: add CRUD functions for uang muka"
```

---

### Task 4: Add Uang Muka Tab to Navigation

**Files:**
- Modify: `src/App.jsx:2029-2051` (PAGE_TITLES and DOCK_ITEMS)

- [ ] **Step 1: Add to PAGE_TITLES**

In the `PAGE_TITLES` object (around line 2029), add after the `'invoicing'` entry:

```javascript
'uang-muka': 'Uang Muka',
```

So it becomes:
```javascript
'invoicing': 'Invoicing',
'uang-muka': 'Uang Muka',
```

- [ ] **Step 2: Add to DOCK_ITEMS**

In the `DOCK_ITEMS` array (around line 2041), add after the invoicing item:

```javascript
{ tab: 'uang-muka', icon: DollarSign, label: 'UM', roles: ['superadmin','admin_invoice','reader'] },
```

This gives the same role access as the invoicing tab.

- [ ] **Step 3: Add tab content rendering**

In the conditional rendering chain (around line 2189 where `activeTab === 'invoicing'` is), add a new condition BEFORE the invoicing condition:

```javascript
) : activeTab === 'uang-muka' ? (
  <UangMukaManagement
    uangMukaList={uangMukaList}
    suratJalanList={suratJalanList}
    currentUser={currentUser}
    onAddUangMuka={() => {
      setModalType('addUangMuka');
      setSelectedItem(null);
      setShowModal(true);
    }}
    onDeleteUangMuka={deleteUangMuka}
    formatCurrency={formatCurrency}
  />
```

Insert this block right before the existing `activeTab === 'invoicing'` block.

- [ ] **Step 4: Verify tab appears in navigation**

Run: `cd sj-monitor && npm run dev`
Expected: New "UM" tab appears in bottom dock for superadmin/admin_invoice/reader roles. Clicking it shows an error (component not defined yet) — that's expected.

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx
git commit -m "feat: add Uang Muka tab to navigation"
```

---

### Task 5: Create UangMukaManagement Component

**Files:**
- Modify: `src/App.jsx` (add new component before or after `InvoiceManagement`, around line 48-362)

- [ ] **Step 1: Add UangMukaManagement component**

After the closing of the `InvoiceManagement` component (after the line that closes its return, around line 362), add the following component:

```javascript
// Uang Muka Management Component
const UangMukaManagement = ({
  uangMukaList,
  suratJalanList,
  currentUser,
  onAddUangMuka,
  onDeleteUangMuka,
  formatCurrency
}) => {
  const [searchUM, setSearchUM] = useState('');
  const effectiveRole = (currentUser?.role === 'owner' ? 'reader' : currentUser?.role) || 'reader';

  const canManageUM = () => {
    return effectiveRole === 'superadmin' || effectiveRole === 'admin_invoice';
  };

  // Group uang muka by SJ for summary
  const umBySJ = {};
  uangMukaList.forEach(um => {
    if (!umBySJ[um.sjId]) umBySJ[um.sjId] = [];
    umBySJ[um.sjId].push(um);
  });

  const filteredUM = uangMukaList.filter(um => {
    if (!searchUM) return true;
    const search = searchUM.toLowerCase();
    return (
      (um.nomorSJ || '').toLowerCase().includes(search) ||
      (um.keterangan || '').toLowerCase().includes(search)
    );
  });

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-md p-3 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">💰 Uang Muka</h2>
            <p className="text-gray-600 mt-1">Kelola Uang Muka (Advance Payment) per Surat Jalan</p>
          </div>
          {canManageUM() && (
            <button
              onClick={onAddUangMuka}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition"
            >
              <Plus className="w-4 h-4" />
              <span>Tambah Uang Muka</span>
            </button>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg shadow-md p-3 sm:p-6 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-blue-100 text-sm mb-1">Total Entri</p>
                <p className="text-3xl font-bold">{uangMukaList.length}</p>
              </div>
              <FileText className="w-12 h-12 text-blue-200" />
            </div>
          </div>
          <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-lg shadow-md p-3 sm:p-6 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-green-100 text-sm mb-1">Total Uang Muka</p>
                <p className="text-2xl font-bold">{formatCurrency(uangMukaList.reduce((sum, um) => sum + (um.jumlah || 0), 0))}</p>
              </div>
              <DollarSign className="w-12 h-12 text-green-200" />
            </div>
          </div>
          <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg shadow-md p-3 sm:p-6 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-orange-100 text-sm mb-1">SJ Terkait</p>
                <p className="text-3xl font-bold">{Object.keys(umBySJ).length}</p>
              </div>
              <Package className="w-12 h-12 text-orange-200" />
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="mb-4">
          <div className="relative">
            <input
              type="text"
              placeholder="Cari Nomor SJ atau Keterangan..."
              value={searchUM}
              onChange={(e) => setSearchUM(e.target.value)}
              className="w-full px-3 py-2 pl-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
            <Search className="w-5 h-5 text-gray-400 absolute left-3 top-2.5" />
            {searchUM && (
              <button
                onClick={() => setSearchUM('')}
                className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
              >
                <XCircle className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        {filteredUM.length === 0 ? (
          <div className="text-center py-12">
            <DollarSign className="w-16 h-16 mx-auto text-gray-300 mb-4" />
            <p className="text-lg font-semibold text-gray-600 mb-2">
              {searchUM ? 'Tidak ada data yang cocok' : 'Belum Ada Uang Muka'}
            </p>
            <p className="text-sm text-gray-500">
              {searchUM ? 'Coba kata kunci lain' : 'Tambahkan uang muka untuk Surat Jalan'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-2 py-2 sm:px-4 text-left text-xs font-medium text-gray-500 uppercase">No SJ</th>
                  <th className="px-2 py-2 sm:px-4 text-left text-xs font-medium text-gray-500 uppercase">Tanggal</th>
                  <th className="px-2 py-2 sm:px-4 text-right text-xs font-medium text-gray-500 uppercase">Jumlah</th>
                  <th className="px-2 py-2 sm:px-4 text-left text-xs font-medium text-gray-500 uppercase">Keterangan</th>
                  <th className="px-2 py-2 sm:px-4 text-left text-xs font-medium text-gray-500 uppercase">Dibuat Oleh</th>
                  {canManageUM() && (
                    <th className="px-2 py-2 sm:px-4 text-center text-xs font-medium text-gray-500 uppercase">Aksi</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredUM.map((um) => (
                  <tr key={um.id} className="hover:bg-gray-50">
                    <td className="px-2 py-2 sm:px-4 text-xs sm:text-sm font-medium text-blue-600">{um.nomorSJ}</td>
                    <td className="px-2 py-2 sm:px-4 text-xs sm:text-sm text-gray-900">
                      {um.tanggal ? new Date(um.tanggal).toLocaleDateString('id-ID') : '-'}
                    </td>
                    <td className="px-2 py-2 sm:px-4 text-xs sm:text-sm text-gray-900 text-right font-semibold">
                      {formatCurrency(um.jumlah)}
                    </td>
                    <td className="px-2 py-2 sm:px-4 text-xs sm:text-sm text-gray-600">{um.keterangan || '-'}</td>
                    <td className="px-2 py-2 sm:px-4 text-xs sm:text-sm text-gray-600">{um.createdBy}</td>
                    {canManageUM() && (
                      <td className="px-2 py-2 sm:px-4 text-center">
                        <button
                          onClick={() => onDeleteUangMuka(um.id)}
                          className="text-red-600 hover:text-red-800 transition"
                          title="Hapus"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-100 font-bold">
                  <td colSpan="2" className="px-2 py-2 sm:px-4 text-xs sm:text-sm text-gray-900 text-right">TOTAL:</td>
                  <td className="px-2 py-2 sm:px-4 text-xs sm:text-sm text-gray-900 text-right">
                    {formatCurrency(filteredUM.reduce((sum, um) => sum + (um.jumlah || 0), 0))}
                  </td>
                  <td colSpan={canManageUM() ? 3 : 2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Verify component renders**

Run: `cd sj-monitor && npm run dev`
Navigate to the "UM" tab.
Expected: Shows the Uang Muka management page with empty state, search bar, and stats (all zero).

- [ ] **Step 3: Commit**

```bash
git add src/App.jsx
git commit -m "feat: add UangMukaManagement component"
```

---

### Task 6: Add Uang Muka Modal Form and Submit Handler

**Files:**
- Modify: `src/App.jsx` (Modal component and submit handler)

- [ ] **Step 1: Add form fields to Modal initial state**

In the `Modal` component's `useState` for `formData` (around line 3783), add these fields to the initial state object:

```javascript
sjIdUM: '',
nomorSJUM: '',
jumlahUM: '',
tanggalUM: new Date().toISOString().split('T')[0],
keteranganUM: '',
```

- [ ] **Step 2: Add validation and submit logic in Modal's handleSubmit**

In the `handleSubmit` function inside the `Modal` component (around line 3836), add after the `addInvoice`/`editInvoice` validation block (after the `onSubmit(formData)` at approximately line 3889):

```javascript
} else if (type === 'addUangMuka') {
  if (!formData.sjIdUM || !formData.jumlahUM || !formData.tanggalUM) {
    setAlertMessage('Surat Jalan, Jumlah, dan Tanggal wajib diisi!');
    return;
  }
  if (parseFloat(formData.jumlahUM) <= 0) {
    setAlertMessage('Jumlah harus lebih besar dari 0!');
    return;
  }
  onSubmit({
    sjId: formData.sjIdUM,
    nomorSJ: formData.nomorSJUM,
    jumlah: formData.jumlahUM,
    tanggal: formData.tanggalUM,
    keterangan: formData.keteranganUM,
  });
```

- [ ] **Step 3: Add form UI in Modal render**

In the Modal's JSX, after the `addTransaksi` form block (search for `type === 'addTransaksi'`), add a new condition. Find the pattern and add before the closing of the conditional chain. Add after the invoice form section (after line 4418 where `</>` closes the invoice form):

Actually, the better insertion point is: find where `} : type === 'addTransaksi' ? (` starts, and add BEFORE it:

```javascript
) : type === 'addUangMuka' ? (
  <>
    {/* Pilih Surat Jalan */}
    <div className="mb-4">
      <label className="block text-sm font-medium text-gray-700 mb-1">Surat Jalan *</label>
      <select
        value={formData.sjIdUM}
        onChange={(e) => {
          const sj = suratJalanList.find(s => s.id === e.target.value);
          setFormData({
            ...formData,
            sjIdUM: e.target.value,
            nomorSJUM: sj?.nomorSJ || ''
          });
        }}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
      >
        <option value="">Pilih Surat Jalan...</option>
        {suratJalanList
          .filter(sj => String(sj?.status || '').toLowerCase() === 'terkirim')
          .map(sj => (
            <option key={sj.id} value={sj.id}>
              {sj.nomorSJ} — {sj.rute} — {sj.qtyBongkar} {sj.satuan}
            </option>
          ))
        }
      </select>
    </div>

    <div className="grid grid-cols-2 gap-4 mb-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Jumlah (Rp) *</label>
        <input
          type="number"
          value={formData.jumlahUM}
          onChange={(e) => setFormData({ ...formData, jumlahUM: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          placeholder="Contoh: 5000000"
          min="0"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Tanggal *</label>
        <input
          type="date"
          value={formData.tanggalUM}
          onChange={(e) => setFormData({ ...formData, tanggalUM: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
        />
      </div>
    </div>

    <div className="mb-4">
      <label className="block text-sm font-medium text-gray-700 mb-1">Keterangan</label>
      <input
        type="text"
        value={formData.keteranganUM}
        onChange={(e) => setFormData({ ...formData, keteranganUM: e.target.value })}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
        placeholder="Keterangan opsional..."
      />
    </div>

    <div className="bg-blue-50 border-l-4 border-blue-500 p-3 rounded-lg">
      <p className="text-sm text-blue-800">
        💡 <strong>Info:</strong> Uang Muka akan mengurangi total harga pada invoice terkait Surat Jalan ini.
      </p>
    </div>
  </>
```

- [ ] **Step 4: Add submit handler in App's onSubmit chain**

In the main `onSubmit` handler (around line 2484 where `modalType === 'addInvoice'` is handled), add after the `editInvoice` block:

```javascript
} else if (modalType === 'addUangMuka') {
  await addUangMuka(data);
  setShowModal(false);
}
```

- [ ] **Step 5: Pass uangMukaList to Modal**

In the `<Modal>` component usage (around line 2420), add `uangMukaList` prop:

```javascript
<Modal
  type={modalType}
  selectedItem={selectedItem}
  ...existing props...
  uangMukaList={uangMukaList}
  onClose={() => setShowModal(false)}
```

And in the Modal function signature (line 3780), add `uangMukaList = []`:

```javascript
const Modal = ({ type, selectedItem, currentUser, setAlertMessage, truckList = [], supirList = [], ruteList = [], materialList = [], suratJalanList = [], uangMukaList = [], onClose, onSubmit }) => {
```

- [ ] **Step 6: Add modal title for addUangMuka**

Search for the modal title rendering section (it will be a conditional like `type === 'addInvoice' ? 'Buat Invoice Baru'`). Add:

```javascript
type === 'addUangMuka' ? 'Tambah Uang Muka' :
```

in the appropriate position of the title conditional.

- [ ] **Step 7: Verify full flow**

Run: `cd sj-monitor && npm run dev`
1. Navigate to "UM" tab
2. Click "Tambah Uang Muka"
3. Select a SJ, enter amount and date
4. Submit
Expected: Uang Muka entry appears in the table. Firestore document created.

- [ ] **Step 8: Commit**

```bash
git add src/App.jsx
git commit -m "feat: add Uang Muka modal form and submit handler"
```

---

### Task 7: Modify Invoice Modal — Add Harga Per Rute Inputs

**Files:**
- Modify: `src/App.jsx` (Modal component — invoice form section)

- [ ] **Step 1: Add ruteHarga to formData initial state**

In the Modal's `useState` for `formData` (line 3783), add:

```javascript
ruteHarga: {},
```

- [ ] **Step 2: Initialize ruteHarga for editInvoice**

In the `useEffect` that initializes editInvoice (around line 3819), add `ruteHarga`:

```javascript
setFormData(prev => ({
  ...prev,
  noInvoice: selectedItem.noInvoice || '',
  tglInvoice: selectedItem.tglInvoice || new Date().toISOString().split('T')[0],
  selectedSJIds: selectedItem.suratJalanIds || [],
  ruteHarga: selectedItem.ruteHarga || {}
}));
```

- [ ] **Step 3: Add Harga Per Rute section in invoice modal form**

In the invoice modal form JSX (around lines 4238-4418), AFTER the SJ selection summary badge (after line 4409 `</div>` that closes the selectedSJIds count display), and BEFORE the info box (before line 4412), add:

```javascript
{/* Harga Per Rute */}
{formData.selectedSJIds.length > 0 && (() => {
  // Collect unique rutes from selected SJ
  const selectedSJs = suratJalanList.filter(sj => formData.selectedSJIds.includes(sj.id));
  const uniqueRutes = [...new Set(selectedSJs.map(sj => sj.rute))].filter(Boolean);
  
  if (uniqueRutes.length === 0) return null;

  // Calculate totals per rute
  const ruteQtys = {};
  selectedSJs.forEach(sj => {
    if (!ruteQtys[sj.rute]) ruteQtys[sj.rute] = 0;
    ruteQtys[sj.rute] += Number(sj.qtyBongkar || 0);
  });

  const totalHarga = uniqueRutes.reduce((sum, rute) => {
    const harga = Number(formData.ruteHarga[rute] || 0);
    return sum + (ruteQtys[rute] * harga);
  }, 0);

  // Calculate total uang muka for selected SJs
  const totalUM = selectedSJs.reduce((sum, sj) => {
    const umForSJ = uangMukaList.filter(um => um.sjId === sj.id);
    return sum + umForSJ.reduce((s, um) => s + (um.jumlah || 0), 0);
  }, 0);

  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-gray-700 mb-2">
        Harga Per Qty (per Rute) *
      </label>
      <div className="border border-gray-300 rounded-lg p-4 bg-gray-50 space-y-3">
        {uniqueRutes.map(rute => (
          <div key={rute} className="flex items-center gap-3 bg-white p-3 rounded-lg border border-gray-200">
            <div className="flex-1">
              <p className="font-semibold text-gray-800 text-sm">{rute}</p>
              <p className="text-xs text-gray-500">Total Qty: {ruteQtys[rute]?.toFixed(2)}</p>
            </div>
            <div className="w-40">
              <input
                type="number"
                value={formData.ruteHarga[rute] || ''}
                onChange={(e) => {
                  setFormData(prev => ({
                    ...prev,
                    ruteHarga: { ...prev.ruteHarga, [rute]: e.target.value }
                  }));
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                placeholder="Harga/qty"
                min="0"
              />
            </div>
            <div className="w-36 text-right">
              <p className="text-sm font-semibold text-blue-600">
                {formatCurrency(ruteQtys[rute] * Number(formData.ruteHarga[rute] || 0))}
              </p>
            </div>
          </div>
        ))}
        
        {/* Total Summary */}
        <div className="border-t pt-3 mt-3 space-y-1">
          <div className="flex justify-between text-sm">
            <span className="font-semibold text-gray-700">Total Harga:</span>
            <span className="font-bold text-gray-900">{formatCurrency(totalHarga)}</span>
          </div>
          {totalUM > 0 && (
            <div className="flex justify-between text-sm">
              <span className="font-semibold text-red-600">Total Uang Muka:</span>
              <span className="font-bold text-red-600">- {formatCurrency(totalUM)}</span>
            </div>
          )}
          <div className="flex justify-between text-sm border-t pt-1">
            <span className="font-bold text-gray-900">Total Setelah UM:</span>
            <span className="font-bold text-green-700">{formatCurrency(totalHarga - totalUM)}</span>
          </div>
        </div>
      </div>
    </div>
  );
})()}
```

Note: This section uses `uangMukaList` which was passed as a prop to Modal in Task 6 Step 5. The `formatCurrency` function is available globally.

- [ ] **Step 4: Verify the Harga Per Rute section**

Run: `cd sj-monitor && npm run dev`
1. Go to Invoice tab, click "Buat Invoice Baru"
2. Select multiple SJ with different rutes
3. Observe: Harga Per Rute section appears with input for each unique rute
4. Enter prices — totals calculate live
Expected: Rute inputs appear, subtotals and grand total calculate correctly.

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx
git commit -m "feat: add Harga Per Rute inputs to invoice creation modal"
```

---

### Task 8: Modify SJ Selection Cards to Show Price and Uang Muka Deductions

**Files:**
- Modify: `src/App.jsx:4346-4397` (SJ card inside invoice modal)

- [ ] **Step 1: Update SJ card grid to show Uang Muka info**

In the SJ selection card JSX (around line 4376 inside the `.map(sj => (` block), modify the grid section. Replace the existing grid (lines 4376-4395):

```javascript
<div className="grid grid-cols-2 gap-2 text-sm">
  <div>
    <p className="text-gray-600">Rute:</p>
    <p className="font-semibold text-gray-800">{sj.rute}</p>
  </div>
  <div>
    <p className="text-gray-600">Material:</p>
    <p className="font-semibold text-gray-800">{sj.material}</p>
  </div>
  <div>
    <p className="text-gray-600">Qty Bongkar:</p>
    <p className="font-semibold text-blue-600">{sj.qtyBongkar} {sj.satuan}</p>
  </div>
  <div>
    <p className="text-gray-600">Tgl Terkirim:</p>
    <p className="font-semibold text-gray-800">
      {sj.tglTerkirim ? new Date(sj.tglTerkirim).toLocaleDateString('id-ID') : '-'}
    </p>
  </div>
</div>
```

With this updated version that includes Uang Muka info:

```javascript
<div className="grid grid-cols-2 gap-2 text-sm">
  <div>
    <p className="text-gray-600">Rute:</p>
    <p className="font-semibold text-gray-800">{sj.rute}</p>
  </div>
  <div>
    <p className="text-gray-600">Material:</p>
    <p className="font-semibold text-gray-800">{sj.material}</p>
  </div>
  <div>
    <p className="text-gray-600">Qty Bongkar:</p>
    <p className="font-semibold text-blue-600">{sj.qtyBongkar} {sj.satuan}</p>
  </div>
  <div>
    <p className="text-gray-600">Tgl Terkirim:</p>
    <p className="font-semibold text-gray-800">
      {sj.tglTerkirim ? new Date(sj.tglTerkirim).toLocaleDateString('id-ID') : '-'}
    </p>
  </div>
  {(() => {
    const umForSJ = uangMukaList.filter(um => um.sjId === sj.id);
    const totalUM = umForSJ.reduce((sum, um) => sum + (um.jumlah || 0), 0);
    const harga = Number(formData.ruteHarga[sj.rute] || 0);
    const subtotal = Number(sj.qtyBongkar || 0) * harga;
    const nett = subtotal - totalUM;
    
    if (totalUM === 0 && harga === 0) return null;
    
    return (
      <>
        {harga > 0 && (
          <div>
            <p className="text-gray-600">Subtotal:</p>
            <p className="font-semibold text-gray-800">{formatCurrency(subtotal)}</p>
          </div>
        )}
        {totalUM > 0 && (
          <div>
            <p className="text-gray-600">Uang Muka:</p>
            <p className="font-semibold text-red-600">- {formatCurrency(totalUM)}</p>
          </div>
        )}
        {harga > 0 && (
          <div className="col-span-2 bg-green-50 rounded p-1 mt-1">
            <p className="text-gray-600 text-xs">Nett setelah UM:</p>
            <p className="font-bold text-green-700">{formatCurrency(nett)}</p>
          </div>
        )}
      </>
    );
  })()}
</div>
```

Note: This uses `uangMukaList` and `formData.ruteHarga` which are both in scope inside the Modal component.

- [ ] **Step 2: Verify SJ cards display pricing info**

Run: `cd sj-monitor && npm run dev`
1. Add some Uang Muka entries first (via UM tab)
2. Go to Invoice, create new invoice
3. Set a Harga Per Rute value
4. Observe SJ cards
Expected: Cards show Subtotal, Uang Muka deduction (if any), and Nett amount when harga is set.

- [ ] **Step 3: Commit**

```bash
git add src/App.jsx
git commit -m "feat: show price and uang muka deductions in SJ selection cards"
```

---

### Task 9: Modify addInvoice and editInvoice to Persist ruteHarga and totalHarga

**Files:**
- Modify: `src/App.jsx:800-924` (addInvoice and editInvoice functions)

- [ ] **Step 1: Update addInvoice to include ruteHarga and totalHarga**

In the `addInvoice` function (around line 800), modify the `newInvoice` object construction. After `totalQty`:

```javascript
const addInvoice = async (data) => {
  const who = currentUser?.name || currentUser?.username || 'User';
  const selectedSJs = suratJalanList.filter(sj => data.selectedSJIds.includes(sj.id));
  
  // Calculate totalHarga from ruteHarga
  const ruteHarga = {};
  Object.keys(data.ruteHarga || {}).forEach(rute => {
    ruteHarga[rute] = Number(data.ruteHarga[rute] || 0);
  });
  
  const totalHarga = selectedSJs.reduce((sum, sj) => {
    return sum + (Number(sj.qtyBongkar || 0) * (ruteHarga[sj.rute] || 0));
  }, 0);

  const newInvoice = {
    id: 'INV-' + Date.now(),
    noInvoice: data.noInvoice,
    tglInvoice: data.tglInvoice,
    suratJalanIds: data.selectedSJIds,
    suratJalanList: selectedSJs,
    totalQty: selectedSJs.reduce((sum, sj) => sum + Number(sj.qtyBongkar || 0), 0),
    ruteHarga: ruteHarga,
    totalHarga: totalHarga,
    createdAt: new Date().toISOString(),
    createdBy: who,
    isActive: true,
  };
```

This replaces the existing `newInvoice` construction — note the `selectedSJs` variable is extracted at the top to avoid duplicating the filter.

- [ ] **Step 2: Update editInvoice to include ruteHarga and totalHarga**

In the `editInvoice` function (around line 846), update the `updatedInvoice` object. After `totalQty`, add:

```javascript
const updatedInvoice = {
  ...invoice,
  suratJalanIds: newSJIds,
  suratJalanList: updatedSJList.filter(sj => newSJIds.includes(sj.id)),
  totalQty: updatedSJList
    .filter(sj => newSJIds.includes(sj.id))
    .reduce((sum, sj) => sum + (sj.qtyBongkar || 0), 0),
  ruteHarga: (() => {
    const rh = {};
    Object.keys(data.ruteHarga || {}).forEach(rute => {
      rh[rute] = Number(data.ruteHarga[rute] || 0);
    });
    return rh;
  })(),
  totalHarga: (() => {
    const sjs = updatedSJList.filter(sj => newSJIds.includes(sj.id));
    return sjs.reduce((sum, sj) => {
      return sum + (Number(sj.qtyBongkar || 0) * Number(data.ruteHarga?.[sj.rute] || 0));
    }, 0);
  })(),
  updatedAt: new Date().toISOString(),
  updatedBy: currentUser.name
};
```

- [ ] **Step 3: Pass ruteHarga in form submit**

In the Modal's `handleSubmit` for invoice types (around line 3880-3889), ensure ruteHarga is included in the submitted data. The current code does `onSubmit(formData)` which already includes `ruteHarga` from formData. **No change needed here** — just verify that `formData.ruteHarga` is part of the submitted data.

- [ ] **Step 4: Verify persistence**

Run: `cd sj-monitor && npm run dev`
1. Create a new invoice with ruteHarga values
2. Check Firebase console: invoice document should have `ruteHarga` and `totalHarga` fields
Expected: Both fields persist correctly.

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx
git commit -m "feat: persist ruteHarga and totalHarga in invoice documents"
```

---

### Task 10: Update Invoice Display and Export with Price Info

**Files:**
- Modify: `src/App.jsx:267-358` (Invoice card display in InvoiceManagement)

- [ ] **Step 1: Add totalHarga display on invoice card**

In the `InvoiceManagement` component, in the invoice card grid (around line 278), add a new field after "Jumlah SJ":

Replace the grid section (lines 278-291):

```javascript
<div className="grid grid-cols-2 gap-4 text-sm">
  <div>
    <p className="text-gray-600">Tanggal Invoice:</p>
    <p className="font-semibold text-gray-800">
      {new Date(invoice.tglInvoice).toLocaleDateString('id-ID')}
    </p>
  </div>
  <div>
    <p className="text-gray-600">Jumlah SJ:</p>
    <p className="font-semibold text-gray-800">
      {invoice.suratJalanIds.length} Surat Jalan
    </p>
  </div>
</div>
```

With:

```javascript
<div className="grid grid-cols-2 gap-4 text-sm">
  <div>
    <p className="text-gray-600">Tanggal Invoice:</p>
    <p className="font-semibold text-gray-800">
      {new Date(invoice.tglInvoice).toLocaleDateString('id-ID')}
    </p>
  </div>
  <div>
    <p className="text-gray-600">Jumlah SJ:</p>
    <p className="font-semibold text-gray-800">
      {invoice.suratJalanIds.length} Surat Jalan
    </p>
  </div>
  {invoice.totalHarga > 0 && (
    <div>
      <p className="text-gray-600">Total Harga:</p>
      <p className="font-bold text-green-700">
        {formatCurrency(invoice.totalHarga)}
      </p>
    </div>
  )}
</div>
```

- [ ] **Step 2: Add Harga column to invoice detail table**

In the invoice detail table (around lines 319-347), update the table header and body to include Harga Per Qty and Subtotal columns.

Replace thead (lines 320-328):
```javascript
<thead className="bg-gray-50">
  <tr>
    <th className="px-2 py-2 sm:px-4 text-left text-xs font-medium text-gray-500 uppercase">No</th>
    <th className="px-2 py-2 sm:px-4 text-left text-xs font-medium text-gray-500 uppercase">No SJ</th>
    <th className="px-2 py-2 sm:px-4 text-left text-xs font-medium text-gray-500 uppercase">Rute</th>
    <th className="px-2 py-2 sm:px-4 text-left text-xs font-medium text-gray-500 uppercase">Material</th>
    <th className="px-2 py-2 sm:px-4 text-right text-xs font-medium text-gray-500 uppercase">Qty Bongkar</th>
    {invoice.ruteHarga && Object.keys(invoice.ruteHarga).length > 0 && (
      <>
        <th className="px-2 py-2 sm:px-4 text-right text-xs font-medium text-gray-500 uppercase">Harga/Qty</th>
        <th className="px-2 py-2 sm:px-4 text-right text-xs font-medium text-gray-500 uppercase">Subtotal</th>
      </>
    )}
  </tr>
</thead>
```

Replace tbody rows (lines 329-346):
```javascript
<tbody className="divide-y divide-gray-200">
  {invoice.suratJalanList.map((sj, idx) => {
    const harga = invoice.ruteHarga?.[sj.rute] || 0;
    const subtotal = Number(sj.qtyBongkar || 0) * harga;
    return (
      <tr key={sj.id} className="hover:bg-gray-50">
        <td className="px-2 py-2 sm:px-4 text-xs sm:text-sm text-gray-600">{idx + 1}</td>
        <td className="px-2 py-2 sm:px-4 text-xs sm:text-sm font-medium text-blue-600">{sj.nomorSJ}</td>
        <td className="px-2 py-2 sm:px-4 text-xs sm:text-sm text-gray-900">{sj.rute}</td>
        <td className="px-2 py-2 sm:px-4 text-xs sm:text-sm text-gray-900">{sj.material}</td>
        <td className="px-2 py-2 sm:px-4 text-xs sm:text-sm text-gray-900 text-right font-semibold">
          {sj.qtyBongkar} {sj.satuan}
        </td>
        {invoice.ruteHarga && Object.keys(invoice.ruteHarga).length > 0 && (
          <>
            <td className="px-2 py-2 sm:px-4 text-xs sm:text-sm text-gray-900 text-right">
              {harga > 0 ? formatCurrency(harga) : '-'}
            </td>
            <td className="px-2 py-2 sm:px-4 text-xs sm:text-sm text-gray-900 text-right font-semibold">
              {harga > 0 ? formatCurrency(subtotal) : '-'}
            </td>
          </>
        )}
      </tr>
    );
  })}
  <tr className="bg-gray-100 font-bold">
    <td colSpan="4" className="px-2 py-2 sm:px-4 text-xs sm:text-sm text-gray-900 text-right">TOTAL:</td>
    <td className="px-2 py-2 sm:px-4 text-xs sm:text-sm text-gray-900 text-right">
      {invoice.totalQty.toFixed(2)}
    </td>
    {invoice.ruteHarga && Object.keys(invoice.ruteHarga).length > 0 && (
      <>
        <td></td>
        <td className="px-2 py-2 sm:px-4 text-xs sm:text-sm text-green-700 text-right font-bold">
          {formatCurrency(invoice.totalHarga || 0)}
        </td>
      </>
    )}
  </tr>
</tbody>
```

- [ ] **Step 3: Update CSV export to include price columns**

In the `exportInvoiceToExcel` function (around line 82), update the headers and rows:

Replace the export logic:
```javascript
const exportInvoiceToExcel = (invoice) => {
  const hasHarga = invoice.ruteHarga && Object.keys(invoice.ruteHarga).length > 0;
  const headers = hasHarga
    ? ['No SJ', 'Tgl SJ', 'No. Polisi', 'Nama Supir', 'Rute', 'Material', 'Qty Bongkar', 'Satuan', 'Harga/Qty', 'Subtotal']
    : ['No SJ', 'Tgl SJ', 'No. Polisi', 'Nama Supir', 'Rute', 'Material', 'Qty Bongkar', 'Satuan'];
  
  const rows = invoice.suratJalanList.map(sj => {
    const harga = invoice.ruteHarga?.[sj.rute] || 0;
    const subtotal = Number(sj.qtyBongkar || 0) * harga;
    const base = [
      sj.nomorSJ,
      new Date(sj.tanggalSJ).toLocaleDateString('id-ID'),
      sj.nomorPolisi,
      sj.namaSupir,
      sj.rute,
      sj.material,
      sj.qtyBongkar,
      sj.satuan
    ];
    if (hasHarga) {
      base.push(harga, subtotal);
    }
    return base;
  });

  let csvContent = headers.join(';') + '\n';
  rows.forEach(row => {
    csvContent += row.map(escapeCsvValue).join(';') + '\n';
  });
  
  if (hasHarga) {
    csvContent += `\nTOTAL;;;;;;;${invoice.totalQty.toFixed(2)};;;${invoice.totalHarga || 0}`;
  } else {
    csvContent += `\nTOTAL;;;;;${invoice.totalQty.toFixed(2)};;`;
  }

  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', `Invoice_${invoice.noInvoice.replace(/\//g, '-')}_${new Date().toISOString().split('T')[0]}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};
```

- [ ] **Step 4: Verify invoice display and export**

Run: `cd sj-monitor && npm run dev`
1. View an invoice that has ruteHarga data
2. Verify Harga/Qty and Subtotal columns appear
3. Export to CSV and verify new columns appear
Expected: Invoice cards and table display pricing info. CSV includes price columns.

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx
git commit -m "feat: display ruteHarga and totalHarga in invoice view and CSV export"
```

---

### Task 11: Final Integration Verification

- [ ] **Step 1: End-to-end test**

Run: `cd sj-monitor && npm run dev`

Complete flow test:
1. **Uang Muka:** Navigate to UM tab → Add Uang Muka for a "terkirim" SJ → Verify it appears in the table
2. **Invoice Creation:** Navigate to Invoice tab → "Buat Invoice Baru" → Select SJ → Observe:
   - Harga Per Rute section appears for each unique rute
   - SJ cards show Uang Muka deductions
   - Total summary shows Total Harga, Total UM, and Nett
3. **Invoice Display:** After creating invoice → Check invoice card shows totalHarga
4. **Invoice Detail:** Check detail table has Harga/Qty and Subtotal columns
5. **CSV Export:** Export invoice → Check CSV has price columns
6. **Uang Muka Delete:** Delete a Uang Muka entry → Verify it disappears

- [ ] **Step 2: Verify build**

Run: `cd sj-monitor && npm run build`
Expected: Build completes with no errors.

- [ ] **Step 3: Final commit (if any remaining changes)**

```bash
git add -A
git commit -m "feat: complete invoice harga per rute and uang muka integration"
```
