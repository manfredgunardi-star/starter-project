# Design: Bulk Import Master Data via Excel

**Date:** 2026-04-27  
**Status:** Approved  
**Scope:** Products, Customers, Suppliers — erp-app

## Context

Onboarding data awal ke ERP sangat lambat karena harus input satu per satu. XLSX library sudah terpasang dan pola `AssetBulkImportPage.jsx` sudah ada dan proven. Fitur ini memungkinkan import ratusan produk/pelanggan/supplier dalam hitungan menit.

## Architecture

### Files Baru
```
erp-app/src/pages/master/
├── CustomersBulkImportPage.jsx
├── SuppliersBulkImportPage.jsx
└── ProductsBulkImportPage.jsx
```

### Files Dimodifikasi
```
erp-app/src/App.jsx                        ← 3 route baru + 3 import
erp-app/src/pages/master/ProductsPage.jsx  ← tombol "Import Excel"
erp-app/src/pages/master/CustomersPage.jsx ← tombol "Import Excel"
erp-app/src/pages/master/SuppliersPage.jsx ← tombol "Import Excel"
```

### Tidak ada perubahan
- `masterDataService.js` — service functions sudah cukup
- Database schema — tidak ada migration
- Sidebar — Import diakses via tombol di list page

## Kolom Template Excel

### Products (`product-import-template.xlsx`)
| Kolom | Wajib | Tipe | Contoh |
|---|---|---|---|
| `name` | Ya | Text | Pasir Halus |
| `sku` | Tidak | Text | PSHLS-001 |
| `category` | Tidak | Text | Material |
| `unit_name` | Ya | Text | Ton |
| `buy_price` | Tidak | Number | 150000 |
| `sell_price` | Tidak | Number | 200000 |
| `is_taxable` | Tidak | `ya`/`tidak` | tidak |

### Customers & Suppliers (`customer-import-template.xlsx`, `supplier-import-template.xlsx`)
| Kolom | Wajib | Tipe | Contoh |
|---|---|---|---|
| `name` | Ya | Text | PT Maju Jaya |
| `address` | Tidak | Text | Jl. Sudirman No. 1 |
| `phone` | Tidak | Text | 08123456789 |
| `email` | Tidak | Text | info@majujaya.com |
| `npwp` | Tidak | Text | 01.234.567.8-901.000 |

## Data Flow

```
Mount halaman
  ↓ Products only: getUnits() → unitMap { name.toLowerCase() → unit_id }
User klik "Download Template"
  ↓ XLSX.utils.aoa_to_sheet() → XLSX.writeFile()
User upload .xlsx
  ↓ FileReader.readAsArrayBuffer() → XLSX.read() → sheet_to_json()
  ↓ parseRows(jsonRows, [unitMap]) → [{ rowNum, valid, errors, data }]
Preview table (valid=putih, invalid=merah) + error details
User klik "Import N baris valid"
  ↓ for loop → createX(data) per baris → progress bar
Result card: X berhasil, Y gagal + daftar error
```

## Validasi

### Products
- `name` wajib
- `unit_name` harus cocok (case-insensitive) dengan nama satuan di sistem
- `buy_price`, `sell_price` >= 0
- `is_taxable`: `ya`→true, selainnya→false

### Customers & Suppliers
- `name` wajib
- `email` format valid jika diisi

**Behavior:** Baris invalid di-skip. Hanya valid rows yang diimport.

## Route Config

```jsx
// Nested dalam Route path="/*" (tanpa leading slash, pola App.jsx:168)
<Route path="master/products/import" element={<RoleGuard require="canWrite"><ProductsBulkImportPage /></RoleGuard>} />
<Route path="master/customers/import" element={<RoleGuard require="canWrite"><CustomersBulkImportPage /></RoleGuard>} />
<Route path="master/suppliers/import" element={<RoleGuard require="canWrite"><SuppliersBulkImportPage /></RoleGuard>} />
```

## Service References
- `createProduct(product, [])` — `masterDataService.js:66`
- `createCustomer(customer)` — `masterDataService.js:238`
- `createSupplier(supplier)` — `masterDataService.js:295`
- `getUnits()` — `masterDataService.js:5`

## Verification
1. `npm run build` — 0 error
2. Manual test: download template → isi data (campuran valid+invalid) → upload → verifikasi preview → import → cek di list page
3. Test error case: `unit_name` yang tidak ada → verifikasi pesan error yang tepat
