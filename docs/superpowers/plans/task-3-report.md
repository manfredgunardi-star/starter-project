## Task 3: Perencana backfill murni

**Status:** DONE

**Commits:** `31c187b` — `feat(bul-accounting): add pure planner for invoice amount backfill`
(adds `apps/bul-accounting/src/utils/invoiceAmountBackfill.js` and
`apps/bul-accounting/src/utils/__tests__/invoiceAmountBackfill.test.js`)

**Test summary:**
- `invoiceAmountBackfill.test.js` alone: 1 file, 13 tests, all pass.
- Full suite (`npm test` from `apps/bul-accounting`): 11 files, 113 tests, all pass — no regressions from Task 1/2 work.

**Build summary:** `npm run build` from `apps/bul-accounting` succeeded (`vite build`, 1773 modules transformed, `✓ built in 8.60s`). Only pre-existing warnings (browserslist data age, >500kB chunk size on `index-*.js`) — unrelated to this change.

**Self-review:**
- Followed the plan's code verbatim for both the test file and `invoiceAmountBackfill.js` (Task 3, Steps 1–6). No improvisation.
- Confirmed the red step first: before creating `invoiceAmountBackfill.js`, running the new test file failed with `Failed to resolve import "../invoiceAmountBackfill"`, as expected.
- `planInvoiceAmountFix` is pure: only import is `resolvePiutangNet` from `./invoiceAmounts` (Task 1's helper). No firebase import, no I/O.
- Verified idempotency (`ALREADY_BACKFILLED` skip when `amountGross` is finite) and payment-safety (`HAS_PAYMENT` skip on `totalPaid > 0` or non-empty `payments`) behave exactly per the plan's test cases.
- Did not touch `apps/bul-monitor`, `firestore.rules`, `chartOfAccounts.js`, or any journal debit/credit lines — untouched, confirmed via `git status` showing only the two new files staged/committed.
- Did not touch or run anything in `scripts/bul-accounting-backfill` (Task 4) — out of scope per instructions.
- Git status after commit: clean except pre-existing untracked `docs/superpowers/plans/task-1-report.md` and `task-2-report.md` from earlier tasks (not created or modified by this task).

**Next:** Ready for review.
