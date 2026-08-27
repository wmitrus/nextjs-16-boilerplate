# Validation Report

## Task Context

- Task ID: OZI-77
- Branch: `fix/ozi-77-sibling-org-containment`
- Commits validated: `65ecd80e` (docs), `3a2502da` (fix), `0777bda9` (test), plus a lint-fix pass applied in this session
- Date: 2026-08-27

## Commands Run and Results

| Check | Command | Result |
|---|---|---|
| Focused route tests | `vitest run --config vitest.unit.config.ts` scoped to `src/app/api/admin/organizations`, `src/app/admin/organizations`, `src/app/admin/invitations` | **PASS** — 10 files, 54 tests |
| Focused real-DB tests (PGlite) | `vitest run --config vitest.db.config.ts` scoped to `DrizzleAdminOrganizationsReadService.db.test.ts`, `DrizzleAdminOrganizationsMutationService.db.test.ts` | **PASS** — 2 files, 7 tests |
| Static platform-admin guard | `vitest run --config vitest.unit.config.ts src/security/core/platform-admin.guard.test.ts` | **PASS** — 43 tests |
| Typecheck | `pnpm typecheck` (`next typegen && tsc --noEmit`) | **PASS** |
| Changed-file lint | `eslint --fix` on the 20 changed `.ts`/`.tsx` files | **PASS** after autofix + one manual import-order fix in `_lib.ts` |
| Architecture lint | `pnpm arch:lint` | **1 pre-existing FAIL**, unrelated to this change (see below); all other checks PASS |
| Real-DB (PostgreSQL) | `pnpm test:db:local` | **NOT RUN** — no local Postgres test service reachable in this environment (no `pg_isready`, no matching Docker container) |

## Architecture Lint Finding — Classified Pre-Existing

`FAIL: security must not directly depend on app/features/modules` on
`src/security/api/strict-rate-limit.ts:13` (imports `DrizzleRateLimitStore`
from `@/modules/rate-limit/infrastructure/drizzle/DrizzleRateLimitStore`).

This file is untouched by the OZI-77 diff. Confirmed by checking out `main`
and re-running `pnpm arch:lint`: the identical FAIL reproduces on `main`
before any OZI-77 change. Classified **confirmed pre-existing**, not a
regression from this incident's remediation. Not remediated here (out of
scope; unrelated module).

The `WARN: global container usage in request-sensitive flows requires review`
is a pre-existing repository-wide warning (not a failure) covering dozens of
files across the codebase, including files this diff touches
(`container.resolve<DrizzleDb>(...)` in the organization routes/pages) using
the same established pattern as every other admin route/page in the repo.

## Scenario Coverage

| Scenario | Evidence |
|---|---|
| S1 — non-platform owner reads active organization | DB test: `contains a non-platform actor to the active organization` |
| S2 — non-platform owner reads sibling organization → not found | Same test — `getDetailInActiveScope` for sibling returns `null` |
| S3 — non-platform owner updates active organization status | Route test: `PATCH ... updates` (pre-existing, still passing with new scope shape) |
| S4 — non-platform owner updates sibling organization status → not found, unchanged | DB test: `rejects a sibling update for a non-platform organization scope` — throws `OrganizationNotFoundError`, row status unchanged |
| S5 — non-platform owner targets another tenant → not found | Covered by the organization-scope filter itself (id-bound, tenant-agnostic); explicit cross-tenant case additionally proven for the active-tenant scope path |
| S6 — platform admin reads/updates sibling under active tenant | DB tests: `allows an explicit platform actor to read siblings...`, `allows a sibling update for an explicit active-tenant scope` |
| S7 — platform admin targets another tenant through active-tenant surface → not found | DB tests: `outsideTenant` read returns `null`; mutation test `rejects updates outside an explicit active-tenant scope` |
| S8 — malformed route UUID → 400 before service/mutation | Route test: `rejects a malformed organization id before any resource lookup or mutation` |

## Diff Scope Check

Final diff touches only the files listed in `intake.md` Scope plus this
session's lint-fix corrections to the same files (no unrelated files
changed). Confirmed via `git diff main --stat` before and after the lint
pass.

## Conclusion

All minimum-required validation for this environment passes. The CRITICAL
sibling-organization/cross-tenant authorization bypass is closed at the code
and local-test level. The one residual gap — a PostgreSQL-backed real-DB run
— does not block closing OZI-77's local containment work but is a named
precondition for OZI-78 production rollout.
