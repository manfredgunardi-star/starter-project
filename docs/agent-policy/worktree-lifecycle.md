# Worktree Lifecycle

## Lokasi dan Penamaan

Worktree baru ditempatkan di `C:\Project\.worktrees\<app>\<task>`. Branch implementer memakai `codex/<app>/<task>` atau `claude/<app>/<task>`. Satu task tidak menggunakan lebih dari satu writer branch.

## Status

| Status | Arti | Aturan |
|---|---|---|
| CREATED | Branch, base commit, path, owner, reviewer, dan scope sudah dicatat | Belum ada perubahan aplikasi |
| ACTIVE | Implementer sedang menulis | Hanya implementer boleh mengubah file |
| REVIEW | Implementasi committed dan tervalidasi | Reviewer read-only memeriksa diff |
| READY | Temuan selesai dan validasi final tersedia | Siap handoff/PR |
| MERGED/CLOSED | Task sudah digabung atau ditutup eksplisit | Periksa eligibility cleanup |
| QUARANTINED | Dirty, unmerged, detached unik, atau ownership ambigu | Jangan hapus atau ubah tanpa keputusan user |
| REMOVED | Worktree dihapus secara normal melalui Git | Branch ditangani terpisah |

## Retention

- Task aktif dengan owner tetap dipertahankan.
- Worktree clean setelah merge dibersihkan maksimal 48 jam setelah verifikasi.
- Worktree tanpa aktivitas selama 14 hari diaudit.
- Task abandoned lebih dari 30 hari diarsipkan dan meminta approval sebelum cleanup.
- Detached worktree dengan commit unik harus diberi safety branch sebelum tindakan lebih lanjut.

## Cleanup Gate

Sebelum cleanup, buktikan worktree clean, HEAD sesuai inventory, commit sudah terkandung di `main`, dan user telah menyetujui manifest cleanup. Hapus worktree dengan `git worktree remove`, lalu jalankan prune metadata. Hapus named branch hanya menggunakan safe deletion setelah Git membuktikan branch merged.

Penghapusan paksa dan recursive filesystem deletion dilarang. Jika Git menolak safe removal, ubah status menjadi QUARANTINED dan laporkan alasannya.
