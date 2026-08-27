# Implementation Plan

## Progress

- [x] Constraints stabilized
- [ ] Scope contract implemented
- [ ] Read service contained
- [ ] Status mutation contained
- [ ] Route callers updated
- [ ] Server Component callers updated
- [ ] Route tests updated
- [ ] Real-DB tests updated
- [ ] Validation complete

## Step 1 — Explicit Scope Contract

- [ ] Add a discriminated `AdminOrganizationsScope` contract in the authorization module.
- [ ] Add a safe factory that selects organization scope by default and active-tenant scope only for explicit platform authority.
- [ ] Change organization access helpers to return `{ allowed, isPlatformAdmin }`.

## Step 2 — Drizzle Enforcement

- [ ] Require `scope` in all organization read-service inputs.
- [ ] For organization scope, filter directly by the authorized organization ID.
- [ ] For active-tenant scope, resolve the active organization's parent tenant and preserve current sibling behavior.
- [ ] Require the same scope in organization-status mutation.
- [ ] Use the scope predicate in the update statement.

## Step 3 — Delivery Callers

- [ ] Update all organization API routes to reject `!allowed` and pass the derived scope.
- [ ] Update all organization/invitation Server Component loaders to pass a scope derived from verified access and platform-admin status.
- [ ] Preserve UUID parsing, shared responses, `withAdminStepUp`, and audit events.

## Step 4 — Scenario Validation

- [ ] S1/S2 read service organization-scope allow/deny.
- [ ] S3/S4/S5 mutation allow/deny and unchanged-row proof.
- [ ] S6/S7 platform active-tenant scope allow/deny.
- [ ] S8 malformed UUID returns 400 before service/mutation.
- [ ] Run all organization admin route tests.
- [ ] Run focused PGlite DB tests and PostgreSQL-backed DB tests.
- [ ] Run changed-file lint, architecture lint, typecheck, and repository phase-close gates.
