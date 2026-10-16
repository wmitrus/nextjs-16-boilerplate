# OZI-146 R3 — Preflight

## Production organization-creation paths

### DrizzleProvisioningService

File:

`src/modules/provisioning/infrastructure/drizzle/DrizzleProvisioningService.ts`

Production provisioning/bootstrap runtime creates organizations in:

- `resolveOrCreatePersonalOrganization()`
- `resolveOrCreateOrgOrganization()`

Both currently insert `organizations` directly and must route through the
canonical R3 organization-creation path.

### bootstrap-admin

File:

`scripts/bootstrap-admin.ts`

Classification:

- production-capable bootstrap/seed compatibility
- not ordinary request-time runtime authority

It currently inserts an organization directly. R3 must preserve bootstrap
behavior without leaving a quota-bypass path.

## Non-production direct inserts

### Seed

`src/modules/authorization/infrastructure/drizzle/seed.ts`

Classification: seed/dev-only.

### Internal E2E fixture

`src/app/api/internal/e2e/authjs-user/route.ts`

Classification: E2E fixture-only.

### DB tests

Direct organization inserts in `*.db.test.ts` are fixture/test-only.

## Admin surface

Current `/api/admin/organizations` route is GET-only. No current production
admin POST/create organization path was found on the R3 baseline.

## Current quota contract

`tenant_attributes.max_organizations` is:

- `NOT NULL`
- `DEFAULT 1`
- currently unread by production organization-creation paths

There is no nullable/unlimited representation in the current schema. R3 must
not invent a sentinel or new unlimited semantic without separate approval.

## Concurrency baseline

Provisioning already uses:

`SELECT ... FROM tenant_attributes ... FOR UPDATE`

for the existing user-limit path.

R3 will use the tenant row as the serialization boundary for organization
creation:

1. ensure the tenant attributes row exists;
2. lock the tenant attributes row with `FOR UPDATE`;
3. read `maxOrganizations`;
4. count organizations belonging to that tenant;
5. reject when the count is at the limit;
6. insert the organization before releasing the transaction.

A separate unprotected `COUNT -> INSERT` sequence is prohibited.

## Transaction boundary

`DrizzleProvisioningService` currently guarantees that provisioning runs in one
atomic transaction.

The organization-creation implementation must therefore be transaction-aware.
It must not introduce a separate autocommit or independent transaction inside
the provisioning transaction.

## R2 compatibility

`TENANCY_MODE` remains bootstrap/provisioning compatibility until R5.

R3 must not:

- restore it as request-time topology authority;
- use it to decide the organization quota;
- use `DEFAULT_TENANT_ID` as request-time creation authority.

The quota source is `tenant_attributes.maxOrganizations`.

## Required R3 proof

A real PostgreSQL race test must prove that concurrent attempts competing for
the last available organization slot cannot exceed `maxOrganizations`.
