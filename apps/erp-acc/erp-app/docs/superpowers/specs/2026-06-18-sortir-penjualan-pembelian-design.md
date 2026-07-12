# Sortir Kolom Penjualan & Pembelian

**Tanggal:** 2026-06-18  
**Status:** Approved

## Latar Belakang

Halaman list Penjualan (SO, GD, Invoice, Proforma, Retur) dan Pembelian (PO, GR, Invoice, Retur) menampilkan data dalam urutan statis dari server. User kesulitan menemukan dokumen tertentu karena tidak bisa mengurutkan kolom.

## Lingkup

**9 halaman yang diubah:**

| Penjualan | Pembelian |
|---|---|
| SalesOrdersPage | PurchaseOrdersPage |
| GoodsDeliveriesPage | GoodsReceiptsPage |
| SalesInvoicesPage | PurchaseInvoicesPage |
| ProformaInvoicesPage | PurchaseReturnsPage |
| SalesReturnsPage | — |

## Pendekatan: Client-side sort via hook + header bisa-diklik

Data sudah dimuat penuh di client oleh `useQuery` — tidak perlu sentuh Supabase/SQL.

## Komponen Baru (2 file)

### `src/hooks/useSortableData.js`

Hook generik dengan signature:

```js
useSortableData(data, sortConfig, defaultSort)
// → { sorted, sortKey, sortDirection, requestSort }
```

- `sortConfig`: peta `key → { accessor: fn, type: 'date'|'number'|'string' }`
- `defaultSort`: `{ key: 'date', direction: 'desc' }` (tanggal terbaru di atas)
- `requestSort(key)`: klik kolom aktif → toggle `asc ↔ desc`; klik kolom baru → pindah ke sana (tanggal default `desc`, lainnya `asc`)
- `sorted` dihitung via `useMemo` dari data masukan yang sudah difilter

### `src/utils/sort.js`

Helper comparator murni (bisa unit-test):

- `date`: bandingkan string ISO/Date
- `number`: numerik (`total`)
- `string`: `localeCompare({ numeric: true, sensitivity: 'base' })` — agar `SO-2026-00009 < SO-2026-00011` dan nama mitra A–Z natural
- Nilai `null`/`undefined` selalu jatuh ke bawah
- Sort **stabil**: baris dengan nilai sama pertahankan urutan asli

### `src/components/ui/SortableHeader.jsx`

`<th>` presentasional:

- **Props:** `label`, `sortKey`, `activeKey`, `direction`, `align`, `onSort`
- Styling identik dengan `<th>` yang ada
- Ikon lucide: `ChevronsUpDown` (netral), `ChevronUp` (asc), `ChevronDown` (desc)
- Kursor pointer; klik panggil `onSort(sortKey)`

## Integrasi per Halaman

Setiap halaman hanya mengalami 3 perubahan:

1. Import `useSortableData` + `SortableHeader`
2. Deklarasikan `sortConfig` dan `defaultSort`; panggil hook di bawah `filtered`
3. Ganti `<th>` kolom sortir → `<SortableHeader>`; render `sorted` (bukan `filtered`)

**Kolom yang bisa disortir per halaman:**

| Halaman | Nomor | Tanggal | Mitra | Total |
|---|:---:|:---:|:---:|:---:|
| SalesOrders | ✓ `so_number` | ✓ `date` | ✓ `customer?.name` | ✓ `total` |
| GoodsDeliveries | ✓ `gd_number` | ✓ `date` | ✓ `customer?.name` | — |
| SalesInvoices | ✓ `invoice_number` | ✓ `date` | ✓ `customer?.name` | ✓ `total` |
| ProformaInvoices | ✓ `proforma_number` | ✓ `date` | ✓ `customer?.name` | ✓ `total` |
| SalesReturns | ✓ `sr_number` | ✓ `date` | ✓ `customer?.name` | ✓ `total` |
| PurchaseOrders | ✓ `po_number` | ✓ `date` | ✓ `supplier?.name` | ✓ `total` |
| GoodsReceipts | ✓ `gr_number` | ✓ `date` | ✓ `supplier?.name` | — |
| PurchaseInvoices | ✓ `invoice_number` | ✓ `date` | ✓ `supplier?.name` | ✓ `total` |
| PurchaseReturns | ✓ `pr_number` | ✓ `date` | ✓ `supplier?.name` | ✓ `total` |

Kolom **Status** dan **Aksi** (tombol Print/PDF) tetap `<th>` biasa — tidak disortir.

## Perilaku

- Default: **tanggal terbaru di atas** (`date desc`)
- Pilihan sortir **tidak disimpan** — reset setiap buka halaman
- Sortir di client, **tanpa panggilan jaringan**

## Validasi

- `cd apps/erp-acc/erp-app && npm run build` harus lulus tanpa error
- Smoke manual: klik tiap header di SO & PO, cek arah asc/desc + ikon berubah

## Di Luar Cakupan

- Sortir server-side
- Penyimpanan pilihan sortir (localStorage)
- Perubahan paginasi
- Migrasi ke komponen `DataTable` AntD
- Sortir kolom Status
