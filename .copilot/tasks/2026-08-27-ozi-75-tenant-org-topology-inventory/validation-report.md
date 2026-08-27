# Validation Report

## Task Context

- Task ID: OZI-75 (local/schema pass)
- Branch: `audit/ozi-75-tenant-org-topology-inventory`
- Date: 2026-08-27

## Commands Run and Results

| Check | Command | Result |
|---|---|---|
| Unit tests (matrix data, evidence-store confinement) | `vitest run --config vitest.unit.config.ts scripts/tenancy-inventory` | **PASS** — 2 files, 7 tests |
| Real-DB tests (read-only enforcement + matrix completeness) | `pnpm test:db:local -- scripts/tenancy-inventory` | **PASS** — 2 files, 7 tests |
| Typecheck | `pnpm typecheck` | **PASS** |
| Targeted ESLint | `eslint --fix` on all new/changed files | **PASS** after `--fix` + 2 narrow, documented `eslint-disable` comments in the test's own confined file cleanup (per `SCRIPT_IMPLEMENTATION_PATTERNS.md`'s "test-owned temporary directories" allowance) |
| `pnpm arch:lint` | full run | Only the pre-existing, unrelated `strict-rate-limit.ts` FAIL (confirmed present on `main` since OZI-77's own validation report) — nothing in `scripts/tenancy-inventory/` flagged |
| Manual dry-run | `pnpm tenancy-inventory:matrix` | **PASS** — prints all 21 tables with owner/module, no errors |
| Manual dry-run | `pnpm tenancy-inventory:scan:test` | **PASS** — ran against real `test-db` (5433); all findings zero (test-db is truncated between test-suite runs, expected) |
| Manual dry-run | `pnpm tenancy-inventory:scan:dev` | **PASS** — ran against real `dev-db` (5432, has persistent manual-testing history); produced non-trivial findings (see `matrix.md` for the qualitative summary — no exact counts recorded here per the evidence-storage constraint) |

## Read-Only Enforcement — Evidence

The critical claim ("technically enforced, not just promised") is proven,
not asserted:

- `readonly-db.db.test.ts` opens a real transaction against `test-db` via
  `withReadOnlyDb` and attempts an `INSERT`, `UPDATE`, `DELETE`, and a
  `CREATE TABLE` inside it. All four are rejected by the Postgres engine
  itself with error code `25006` (`cannot execute ... in a read-only
  transaction`) — asserted directly against the wrapped error's `.cause`
  (Drizzle wraps the raw driver error; the top-level message is generic,
  the code and real message live on `.cause`, same pattern already
  documented in `DrizzleFeatureFlagAdminService.isUniqueViolation`).
- A successful `SELECT` inside the same wrapper is also proven, so the
  enforcement isn't blocking reads too.
- Nothing in `scripts/tenancy-inventory/` constructs a transaction/db
  handle outside `withReadOnlyDb`, so no query in this tool can reach the
  database without going through this proven-enforced path.

## Evidence-Storage Compliance

- Raw scan output from both local dry-runs was written only to
  `~/.local/share/nextjs-16-boilerplate/ozi-75/local/` (outside the repo,
  confirmed via `evidence-store.test.ts`'s
  `EVIDENCE_ROOT.startsWith(process.cwd())` assertion, which is `false`).
- `git status` was checked after both dry-runs: no new file appeared under
  the repository working tree from running `scan` — only the code itself
  (already staged before the dry-run) shows as changed.
- `matrix.md` and `example-report.md` (committed) contain only the static
  schema-derived matrix and fully synthetic example values respectively —
  no real local counts.

## Diff Scope Check

Changed/added files: `scripts/tenancy-inventory/**` (new), `package.json`
(4 new script entries), `vitest.db.config.ts` / `vitest.db.local.config.ts`
(added `scripts/**/*.db.test.ts` to `include`), `vitest.unit.config.ts`
(added `scripts/**/*.db.test.{ts,tsx}` to `exclude`, so the new DB test
isn't double-run by the jsdom unit runner without a real Postgres
connection). No application code (`src/**`) touched.

## Formal Review Follow-Up (2026-08-27, second commit)

Requested and completed after the first checkpoint commit: formal
Security/Auth + Architecture review against 5 explicit criteria (see both
specialist summaries). Found and fixed one real issue during the review —
3 of 8 topology queries were bounded (`LIMIT`) but fetched row-level ids
into Node before collapsing to a count, rather than being aggregate-only
at the SQL level. Rewrote all 3 as pure Postgres aggregates; re-ran the
full dry-run against `dev-db` afterward and confirmed byte-identical
output to the pre-fix run, so the rewrite is behavior-preserving. Also
added `ownership-matrix.completeness.db.test.ts`, which passes against
real `test-db` and closes the "hand-authored, could silently go stale"
risk noted in the first `01 - Architecture Guard - Summary.md`.

Re-ran full validation after the fix: 7 unit tests, 7 real-DB tests (was
6 — the new completeness test), typecheck clean, targeted lint clean,
`arch:lint` unchanged (same one pre-existing unrelated FAIL).

## Conclusion

All minimum-required validation for this local/schema pass is complete and
passing. The read-only enforcement claim is proven against real Postgres,
not assumed. No environment-specific raw data was committed. Residual:
this pass produced qualitative findings worth Phase 1's attention (see
`matrix.md`) but establishes no quantitative baseline in the repository by
design — that lives in the local evidence file, per the user's explicit
evidence-storage constraint.
