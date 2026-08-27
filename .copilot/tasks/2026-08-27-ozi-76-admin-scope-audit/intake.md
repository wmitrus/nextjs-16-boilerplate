# Intake

## Objective

Audit tenant and resource scope across the complete admin surface
(`src/app/api/admin/**` route handlers and `src/app/admin/**` Server
Component pages), following on from OZI-77's sibling-organization
containment fix. Identify and close, or explicitly defer with a blocking
follow-up, every path where action-level authorization is mistaken for
resource/tenant-level scope (SEC-26/SEC-41).

## Scope

- All `src/app/api/admin/**/route.ts` handlers.
- All `src/app/admin/**/page.tsx` Server Component data loaders.
- No Server Actions exist under either tree (confirmed via `grep -rl "'use server'"`).
- `src/app/api/admin/organizations/**` and its 7 pages are explicitly
  out of scope for re-audit: already fixed and validated in OZI-77.

## Environment

- Local `dev-db` (port 5432, podman) and `test-db` (port 5433, podman) both
  up and migrated at task start, specifically so no confirmed gap in this
  task has to defer real-Postgres evidence.

## Verification Sources

- Linear OZI-76 (parent OZI-74, Phase 0).
- Live route/page/service code on `audit/ozi-76-admin-scope-audit`, branched
  from `main` at `2450d410` (post-OZI-77).
- SECURITY_CODING_PATTERNS.md: SEC-26, SEC-23, SEC-41.

## Readiness

- [x] canonical Linear issue exists (OZI-76, Todo → In Progress once picked up)
- [x] local real-Postgres test environment confirmed working
- [x] first CRITICAL finding fixed and validated (see `matrix.md`,
      `02 - Security & Auth - Summary.md`)
- [x] full route/page inventory matrix finalized with formal sign-off (see
      `02 - Security & Auth - Summary.md` § Full-Matrix Sign-Off)
- [ ] Linear closure update
