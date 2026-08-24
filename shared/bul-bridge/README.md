# shared/bul-bridge

Kontrak data exchange antara `apps/bul-monitor` dan `apps/bul-accounting`.

## Alur Data

```
bul-monitor (operasional)  ──→  bul-accounting (pembukuan)
   Surat Jalan, ritasi            Jurnal, penjualan, kas/bank
   data pengiriman harian         laporan keuangan
```

## Apa yang ada di sini

Folder ini bukan shared library (tidak ada kode yang di-import). Ini adalah **dokumentasi kontrak** — mendefinisikan:

- Struktur data apa yang dikirim dari bul-monitor ke bul-accounting
- Field apa yang wajib ada, opsional, atau deprecated
- Aturan transformasi data (jika ada)

## Collection `integration_queue`

bul-monitor menulis ke collection `integration_queue` di Firestore bul-accounting.
Tiga tipe: `uang_jalan`, `invoice`, `transaksi_kas`. ID deterministik supaya idempoten:
`IQ-UJ-{sjId}`, `IQ-INV-{invoiceId}`.

### Mapping akun

| Akun | Nama | Dipakai untuk |
|---|---|---|
| 1121 | Piutang Pelanggan – Proyek | piutang **bersih** setelah potongan uang jalan |
| 1151 | Uang Muka Sopir/Uang Jalan | WIP uang jalan dan biaya non-upah |
| 2122 | Hutang Uang Jalan Sopir | kewajiban biaya tambahan ke sopir |
| 2141 | Uang Muka Pelanggan | uang jalan sebagai uang muka dari pelanggan |
| 4100 | Pendapatan Usaha | pendapatan **bruto** |
| 5130 | Upah Sopir | upah/gaji/honor, diakui langsung saat SJ selesai |
| 5150 | Uang Jalan, Makan & Penginapan Sopir | HPP saat invoice diakui |

### Jurnal saat Surat Jalan dikirim

```
Dr 1151 Uang Muka Sopir/Uang Jalan     uangJalan
   Cr 2141 Uang Muka Pelanggan            uangJalan
Biaya tambahan upah     → Dr 5130 / Cr 2122
Biaya tambahan non-upah → Dr 1151 (WIP) / Cr 2122
```

### Jurnal saat Invoice dikirim

```
Dr 1121 Piutang            totalNilai − totalUJ    ← BERSIH
Dr 2141 Uang Muka Plgn     totalUJ                 ← clearing
   Cr 4100 Pendapatan         totalNilai           ← BRUTO
Dr 5150 HPP / Cr 1151 WIP  totalUJ + biaya non-upah
```

### Aturan bruto vs bersih

Uang jalan adalah uang muka yang sudah diterima dari pelanggan. Karena itu:

- **Pendapatan diakui bruto** — nilai penuh invoice.
- **Piutang diakui bersih** — nilai invoice dikurangi uang jalan.
- **Subledger `invoices` wajib mengikuti angka bersih.** Field `amount` menyimpan
  piutang bersih, `amountGross` menyimpan nilai bruto, `totalUJ` menyimpan potongannya.
  Bila `amount` menyimpan bruto, subledger AR akan berselisih dari saldo GL 1121 tepat
  sebesar total uang jalan.

### Field yang dikirim untuk tipe `invoice`

| Field | Tipe | Catatan |
|---|---|---|
| `totalNilai` | number | nilai invoice bruto |
| `totalUJ` | number | total uang jalan seluruh SJ dalam invoice |
| `piutangNet` | number | `totalNilai − totalUJ`; konsumen wajib menyediakan fallback untuk dokumen lama |
| `totalBiayaLain` | number | biaya non-upah yang perlu di-clear dari WIP |
| `suratJalanList` | object[] | rincian per SJ termasuk `uangJalan` |
| `suggestedJournal` | object | usulan baris jurnal; akuntan boleh mengedit sebelum approve |

## Catatan Implementasi

Saat ini integrasi dilakukan langsung antar app melalui Firestore (bul-accounting membaca collection tertentu dari bul-monitor). Tidak ada shared package atau API gateway.

Jika di masa depan integrasi berubah (REST API, message queue, dsb.), dokumentasikan perubahannya di sini sebelum mengimplementasikan.
