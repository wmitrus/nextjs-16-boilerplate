# Implementation Plan

## Progress

- [x] Constraints stabilized
- [x] Scope contract implemented
- [x] Read service contained
- [x] Status mutation contained
- [x] Route callers updated
- [x] Server Component callers updated
- [x] Route tests updated
- [x] Real-DB tests updated (PGlite; Postgres-backed run deferred — see intake.md Open Questions)
- [x] Validation complete (local environment)

## Step 1 — Explicit Scope Contract

- [x] Add a discriminated `AdminOrganizationsScope` contract in the authorization module (`src/modules/authorization/domain/AdminOrganizationsScope.ts`).
- [x] Add a safe factory that selects organization scope by default and active-tenant scope only for explicit platform authority (`createAdminOrganizationsScope`).
- [x] Change organization access helpers to return `{ allowed, isPlatformAdmin }` (`_lib.ts`).

## Step 2 — Drizzle Enforcement

- [x] Require `scope` in all organization read-service inputs.
- [x] For organization scope, filter directly by the authorized organization ID.
- [x] For active-tenant scope, resolve the active organization's parent tenant and preserve current sibling behavior.
- [x] Require the same scope in organization-status mutation.
- [x] Use the scope predicate in the update statement.

## Step 3 — Delivery Callers

- [x] Update all organization API routes to reject `!allowed` and pass the derived scope.
- [x] Update all organization/invitation Server Component loaders to pass a scope derived from verified access and platform-admin status.
- [x] Preserve UUID parsing, shared responses, `withAdminStepUp`, and audit events.

## Step 4 — Scenario Validation

- [x] S1/S2 read service organization-scope allow/deny — proven by DB test.
- [x] S3/S4/S5 mutation allow/deny and unchanged-row proof — proven by DB test.
- [x] S6/S7 platform active-tenant scope allow/deny — proven by DB test.
- [x] S8 malformed UUID returns 400 before service/mutation — proven by route test.
- [x] Run all organization admin route tests — 54/54 passing.
- [x] Run focused PGlite DB tests (7/7 passing); PostgreSQL-backed DB tests could not run (no local Postgres test service).
- [x] Run changed-file lint, architecture lint, typecheck — clean (pre-existing unrelated arch:lint FAIL on `strict-rate-limit.ts` confirmed present on `main`).
