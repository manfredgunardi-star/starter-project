## Task 5: Dokumentasikan kontrak bridge

**Status:** DONE

**Commits:** `eef073c` — `docs(bul-bridge): document the actual journal contract and gross-vs-net rule`

**Verifikasi struktur file:** Konten disisipkan tepat sebelum bagian `## Catatan Implementasi` yang sudah ada, sesuai instruksi plan. Heading level konsisten (`##` untuk section utama: "Collection `integration_queue`", "Catatan Implementasi"; `###` untuk subsection: "Mapping akun", "Jurnal saat Surat Jalan dikirim", "Jurnal saat Invoice dikirim", "Aturan bruto vs bersih", "Field yang dikirim untuk tipe `invoice`"). Kedua tabel markdown (Mapping akun, Field yang dikirim) memiliki jumlah kolom yang konsisten di seluruh baris termasuk header separator. Tidak ada bagian yang terduplikasi — dibaca ulang file lengkap setelah commit dan strukturnya valid dari awal sampai akhir.

**Self-review:** Sempat salah mengedit `C:\Project\shared\bul-bridge\README.md` (checkout utama, branch `main`) alih-alih file di dalam worktree task (`C:\Project\VPS\.claude\worktrees\vps-ssh-root-access-0d322c\shared\bul-bridge\README.md`), karena kedua path terlihat identik secara relatif. Perubahan yang salah tempat itu langsung di-revert dengan `git restore shared/bul-bridge/README.md` di `C:\Project` sebelum ada commit apa pun di sana — dikonfirmasi bersih via `git status --short`. Edit yang benar kemudian diterapkan ulang persis di worktree task dan di-commit dari sana. Tidak ada file lain yang tersentuh; tidak ada perubahan pada `apps/bul-monitor` atau `apps/bul-accounting/src/**`.

**Next:** Ready for review. Setelah ini, seluruh plan (Task 1-5) selesai — review whole-branch akan didispatch terpisah.
