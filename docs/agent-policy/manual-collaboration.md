# Manual Codex–Claude Collaboration

## Operating Model

- Satu task contract menetapkan satu implementer dan satu reviewer.
- Implementer memiliki satu branch dan satu worktree terisolasi.
- Reviewer read-only dan menilai committed diff, bukan mengubah source.
- Codex dan Claude tidak menulis bersamaan pada worktree yang sama.
- Maksimal dua siklus implementasi-review sebelum blocking disagreement dieskalasikan.

## Task Contract

```yaml
task_id: APP-123
project: sj-monitor
objective: Perilaku terukur yang hendak dicapai
implementer: codex
reviewer: claude
allowed_paths:
  - apps/sj-monitor/src/path-yang-disetujui
protected_paths:
  - apps/sj-monitor/firestore.rules
financial_logic: false
schema_change: false
auth_change: false
production_deploy: false
staging_deploy: false
required_checks:
  - npm test
  - npm run lint
  - npm run build
acceptance_criteria:
  - Bukti perilaku yang harus terpenuhi
```

`allowed_paths` tidak memberi izin mengubah protected behavior. Jika implementasi membutuhkan perluasan scope, implementer berhenti dan meminta persetujuan user.

## Workflow

1. Sepakati task contract.
2. Buat isolated worktree dan catat base commit.
3. Jalankan baseline validation yang relevan.
4. Implementer mengubah hanya allowed paths dan menjalankan required checks.
5. Implementer membuat commit terfokus.
6. Reviewer membaca `base...head` secara read-only dan menghasilkan temuan berbukti.
7. Implementer mengklasifikasikan temuan sebagai `accepted`, `rejected_with_evidence`, `needs_user_decision`, atau `out_of_scope`.
8. Jalankan ulang validasi dan maksimal satu review ulang.
9. User menyetujui handoff, perubahan sensitif, dan external mutation yang memang diperlukan.
10. Setelah merge/close, jalankan lifecycle cleanup terpisah.

## Review Contract

```json
{
  "verdict": "approve|changes_required|needs_user_decision",
  "findings": [
    {
      "severity": "high|medium|low",
      "file": "path",
      "line": 123,
      "claim": "Masalah yang ditemukan",
      "evidence": "Bukti konkret",
      "suggested_fix": "Perbaikan yang disarankan",
      "blocking": true
    }
  ]
}
```

Reviewer tidak boleh menjadikan saran gaya sebagai blocking tanpa bukti dampak terhadap acceptance criteria, keamanan, integritas data, atau maintainability dalam scope.
