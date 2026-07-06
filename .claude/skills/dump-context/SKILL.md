---
name: dump-context
description: Use when you need to dump an entire app's codebase into one file to paste as AI context. Wraps Repomix. Triggers - "dump context", "pack codebase", "kumpulkan konteks app X".
---

# Dump Context (Repomix)

Pack satu app jadi satu file Markdown untuk konteks AI.

## Cara pakai
```bash
npx repomix apps/<app> --output context-<app>.md --style markdown
```
Contoh: `npx repomix apps/bul-accounting --output context-bul-accounting.md --style markdown`

## Catatan
- File `context-*.md` sudah gitignored (besar & sementara).
- Hanya file tertentu: `npx repomix apps/<app> --include "src/**/*.jsx"`.
- Guardrail: JANGAN paste file yang memuat secret (.env, keys). Repomix menghormati .gitignore, jadi node_modules/.env biasanya otomatis dikecualikan.
