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

## Catatan Implementasi

Saat ini integrasi dilakukan langsung antar app melalui Firestore (bul-accounting membaca collection tertentu dari bul-monitor). Tidak ada shared package atau API gateway.

Jika di masa depan integrasi berubah (REST API, message queue, dsb.), dokumentasikan perubahannya di sini sebelum mengimplementasikan.
