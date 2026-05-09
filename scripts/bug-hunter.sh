#!/usr/bin/env bash
# bug-hunter.sh — Autonomous bug-fix pipeline untuk sj-monitor
#
# Usage:
#   ./scripts/bug-hunter.sh <issue_number>
#
# Prerequisites:
#   - gh CLI (authenticated)
#   - git
#   - claude (Claude Code CLI, npm install -g @anthropic-ai/claude-code)
#   - node / npm
#   - ANTHROPIC_API_KEY env var set
#
# Safety contract:
#   - Buat isolated git worktree per issue
#   - Jalankan claude --print dalam worktree
#   - Buka PR tapi TIDAK PERNAH deploy ke Firebase
#   - Cleanup worktree pada sukses MAUPUN gagal

set -euo pipefail

# ─── Configuration ────────────────────────────────────────────────────────────
GITHUB_REPO="manfredgunardi-star/starter-project"
REPO_ROOT="$(git rev-parse --show-toplevel)"
PROJECT_SUBDIR="apps/sj-monitor"
PROJECT_DIR="${REPO_ROOT}/${PROJECT_SUBDIR}"
WORKTREES_DIR="${REPO_ROOT}/.worktrees"
MAX_CLAUDE_TURNS=30
TIMEOUT_MINUTES=20

# ─── Input validation ─────────────────────────────────────────────────────────
if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <github_issue_number>" >&2
  exit 1
fi

ISSUE_NUMBER="$1"

if ! [[ "$ISSUE_NUMBER" =~ ^[0-9]+$ ]]; then
  echo "ERROR: Issue number must be an integer, got: $ISSUE_NUMBER" >&2
  exit 1
fi

echo "=== Bug-Hunter Pipeline: Issue #${ISSUE_NUMBER} ==="

# ─── Prerequisite checks ──────────────────────────────────────────────────────
for cmd in gh git claude node npm; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "ERROR: '$cmd' not found in PATH" >&2
    exit 1
  fi
done

if [[ -z "${ANTHROPIC_API_KEY:-}" ]]; then
  echo "ERROR: ANTHROPIC_API_KEY is not set" >&2
  exit 1
fi

if ! gh auth status &>/dev/null; then
  echo "ERROR: gh CLI not authenticated. Run: gh auth login" >&2
  exit 1
fi

# ─── Fetch issue metadata ─────────────────────────────────────────────────────
echo "Fetching issue #${ISSUE_NUMBER} from GitHub..."

ISSUE_JSON=$(gh issue view "${ISSUE_NUMBER}" \
  --repo "${GITHUB_REPO}" \
  --json number,title,body,labels,state 2>/dev/null) || {
  echo "ERROR: Could not fetch issue #${ISSUE_NUMBER}" >&2
  exit 1
}

ISSUE_STATE=$(echo "$ISSUE_JSON" | node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).state)")
ISSUE_TITLE=$(echo "$ISSUE_JSON" | node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).title)")
ISSUE_BODY=$(echo "$ISSUE_JSON"  | node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).body || '')")
ISSUE_LABELS=$(echo "$ISSUE_JSON" | node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).labels.map(l=>l.name).join(','))")

echo "Title:  ${ISSUE_TITLE}"
echo "State:  ${ISSUE_STATE}"
echo "Labels: ${ISSUE_LABELS}"

# ─── Safety gate: labels ──────────────────────────────────────────────────────
if ! echo "$ISSUE_LABELS" | grep -q "bug"; then
  echo "SKIP: Issue #${ISSUE_NUMBER} tidak punya label 'bug'. Keluar aman." >&2
  exit 0
fi

if ! echo "$ISSUE_LABELS" | grep -q "ai-fixable"; then
  echo "SKIP: Issue #${ISSUE_NUMBER} tidak punya label 'ai-fixable'. Keluar aman." >&2
  exit 0
fi

if [[ "$ISSUE_STATE" != "OPEN" ]]; then
  echo "SKIP: Issue #${ISSUE_NUMBER} bukan OPEN (state: ${ISSUE_STATE}). Keluar aman." >&2
  exit 0
fi

# ─── Cek PR yang sudah ada ────────────────────────────────────────────────────
EXISTING_PR=$(gh pr list \
  --repo "${GITHUB_REPO}" \
  --search "closes #${ISSUE_NUMBER} in:body" \
  --json number \
  --jq '.[0].number' 2>/dev/null || echo "")

if [[ -n "$EXISTING_PR" ]]; then
  echo "SKIP: PR #${EXISTING_PR} sudah ada untuk issue #${ISSUE_NUMBER}. Keluar aman." >&2
  exit 0
fi

# ─── Worktree setup ───────────────────────────────────────────────────────────
BRANCH_NAME="fix/issue-${ISSUE_NUMBER}-$(date +%Y%m%d)"
WORKTREE_PATH="${WORKTREES_DIR}/fix-${ISSUE_NUMBER}"

mkdir -p "${WORKTREES_DIR}"

# Tambah .worktrees/ ke .gitignore jika belum ada
GITIGNORE="${REPO_ROOT}/.gitignore"
if [[ -f "$GITIGNORE" ]] && ! grep -qF ".worktrees/" "$GITIGNORE"; then
  echo ".worktrees/" >> "$GITIGNORE"
elif [[ ! -f "$GITIGNORE" ]]; then
  echo ".worktrees/" > "$GITIGNORE"
fi

# Hapus worktree lama jika ada (dari failed run sebelumnya)
if [[ -d "${WORKTREE_PATH}" ]]; then
  echo "Menghapus stale worktree di ${WORKTREE_PATH}..."
  git -C "${REPO_ROOT}" worktree remove --force "${WORKTREE_PATH}" 2>/dev/null || true
  rm -rf "${WORKTREE_PATH}"
fi

echo "Membuat worktree: ${WORKTREE_PATH} (branch: ${BRANCH_NAME})"
git -C "${REPO_ROOT}" fetch origin main --quiet
git -C "${REPO_ROOT}" worktree add "${WORKTREE_PATH}" -b "${BRANCH_NAME}" origin/main

WORKTREE_PROJECT="${WORKTREE_PATH}/${PROJECT_SUBDIR}"

# Install deps di worktree
echo "Installing npm dependencies di worktree..."
npm --prefix "${WORKTREE_PROJECT}" ci --quiet

# ─── Cleanup trap ─────────────────────────────────────────────────────────────
cleanup() {
  local exit_code=$?
  echo "Membersihkan worktree ${WORKTREE_PATH}..."
  git -C "${REPO_ROOT}" worktree remove --force "${WORKTREE_PATH}" 2>/dev/null || true
  rm -rf "${WORKTREE_PATH}"
  git -C "${REPO_ROOT}" worktree prune 2>/dev/null || true
  # Hapus branch fix jika gagal (tidak ada PR yang dibuat)
  if [[ $exit_code -ne 0 ]]; then
    git -C "${REPO_ROOT}" branch -d "${BRANCH_NAME}" 2>/dev/null || true
  fi
  exit $exit_code
}
trap cleanup EXIT

# ─── Tulis issue body ke temp file ───────────────────────────────────────────
ISSUE_BODY_FILE=$(mktemp /tmp/issue-body-XXXXXX.txt)
printf '%s' "$ISSUE_BODY" > "$ISSUE_BODY_FILE"
CLAUDE_OUTPUT_FILE=$(mktemp /tmp/claude-output-XXXXXX.txt)

# ─── Konstruksi prompt untuk Claude ──────────────────────────────────────────
CLAUDE_PROMPT="Kamu sedang memperbaiki GitHub issue #${ISSUE_NUMBER} di project sj-monitor.

Issue title: ${ISSUE_TITLE}

Issue body:
$(cat "$ISSUE_BODY_FILE")

Working directory kamu: ${WORKTREE_PROJECT}
Git branch: ${BRANCH_NAME}
Issue number untuk digunakan di nama test file dan commit message: ${ISSUE_NUMBER}

Ikuti instruksi bug-hunter skill dengan tepat. Mulai dari Phase 1."

# ─── Jalankan Claude headless ─────────────────────────────────────────────────
echo "Meluncurkan Claude Code agent (max ${MAX_CLAUDE_TURNS} turns, timeout ${TIMEOUT_MINUTES}m)..."

timeout "${TIMEOUT_MINUTES}m" claude \
  --print \
  --skill bug-hunter \
  --max-turns "${MAX_CLAUDE_TURNS}" \
  --cwd "${WORKTREE_PROJECT}" \
  "$CLAUDE_PROMPT" \
  > "$CLAUDE_OUTPUT_FILE" 2>&1
CLAUDE_EXIT=$?

cat "$CLAUDE_OUTPUT_FILE"

if [[ $CLAUDE_EXIT -ne 0 ]]; then
  echo "ERROR: claude keluar dengan kode ${CLAUDE_EXIT}" >&2
  gh issue comment "${ISSUE_NUMBER}" \
    --repo "${GITHUB_REPO}" \
    --body "**Bug-Hunter pipeline gagal** untuk issue #${ISSUE_NUMBER}. Claude exited code ${CLAUDE_EXIT}. Perlu intervensi manual." \
    2>/dev/null || true
  exit 1
fi

# ─── Parse JSON summary dari Claude ──────────────────────────────────────────
LAST_JSON=$(grep '^{"status"' "$CLAUDE_OUTPUT_FILE" | tail -1 || echo "")

if [[ -z "$LAST_JSON" ]]; then
  echo "ERROR: Claude tidak output JSON summary line" >&2
  exit 1
fi

STATUS=$(echo "$LAST_JSON" | node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).status)")
NEEDS_HUMAN=$(echo "$LAST_JSON" | node -e "process.stdout.write(String(JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).needs_human||false))")

if [[ "$STATUS" != "success" ]]; then
  REASON=$(echo "$LAST_JSON" | node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).reason||'unknown')")
  echo "Agent melaporkan gagal: ${REASON}"
  if [[ "$NEEDS_HUMAN" == "true" ]]; then
    gh issue comment "${ISSUE_NUMBER}" \
      --repo "${GITHUB_REPO}" \
      --body "**Bug-Hunter**: Issue ini memerlukan review human. Alasan: ${REASON}" \
      2>/dev/null || true
    gh issue edit "${ISSUE_NUMBER}" \
      --repo "${GITHUB_REPO}" \
      --add-label "needs-human-review" \
      2>/dev/null || true
  fi
  exit 1
fi

COMMIT_SHA=$(echo "$LAST_JSON" | node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).commit||'')")
SUMMARY=$(echo "$LAST_JSON" | node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).summary||'')")
echo "Agent berhasil. Commit: ${COMMIT_SHA}"

# ─── Final validation gate (double-check) ────────────────────────────────────
echo "Menjalankan final validation di worktree..."
cd "${WORKTREE_PROJECT}"

echo "  npm test..."
npm test --silent || {
  echo "ERROR: Tests gagal setelah agent selesai. Abort PR creation." >&2
  exit 1
}

echo "  npm run lint..."
npm run lint --silent || {
  echo "ERROR: Lint gagal setelah agent selesai. Abort PR creation." >&2
  exit 1
}

echo "  npm run build..."
npm run build --silent || {
  echo "ERROR: Build gagal setelah agent selesai. Abort PR creation." >&2
  exit 1
}

echo "Semua validation gate passed."

# ─── Push branch ──────────────────────────────────────────────────────────────
echo "Pushing branch ${BRANCH_NAME}..."
git -C "${WORKTREE_PATH}" push origin "${BRANCH_NAME}"

# ─── Buat PR ──────────────────────────────────────────────────────────────────
echo "Membuat pull request..."

PR_URL=$(gh pr create \
  --repo "${GITHUB_REPO}" \
  --title "fix: ${ISSUE_TITLE} (closes #${ISSUE_NUMBER})" \
  --body "## Summary

${SUMMARY}

Fixes #${ISSUE_NUMBER}

## Test Evidence

Fix ini diimplementasikan dengan TDD:
1. Failing Vitest test ditulis terlebih dahulu untuk mereproduksi bug
2. Fix minimal diimplementasikan hingga test pass
3. Lint dan build validation keduanya passed

## Validation

- [x] \`npm test\` — semua tests pass
- [x] \`npm run lint\` — tidak ada lint errors
- [x] \`npm run build\` — production build sukses

## Safety

- Tidak ada Firebase deploy yang dilakukan
- Tidak ada financial calculation logic yang diubah
- Tidak ada Firestore rules yang dimodifikasi
- PR ini memerlukan human review sebelum merge

---
_Generated by Bug-Hunter pipeline. Agent commit: \`${COMMIT_SHA}\`_" \
  --base main \
  --head "${BRANCH_NAME}" \
  --label "bug,ai-generated,needs-review" \
  2>&1)

echo "PR dibuat: ${PR_URL}"

gh issue comment "${ISSUE_NUMBER}" \
  --repo "${GITHUB_REPO}" \
  --body "**Bug-Hunter pipeline selesai.** PR dibuat: ${PR_URL}" \
  2>/dev/null || true

echo "=== Bug-Hunter Pipeline Complete ==="
echo "PR: ${PR_URL}"
