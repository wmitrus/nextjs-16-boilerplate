# Feature 35 — Admin User Management

## Overview

Adds a protected admin panel at `/admin/users` that allows authorized administrators (env-based platform admins and ABAC-authorized organization admins — see **Access Control**) to list, search, update display names, and deactivate registered users.

## Access Control

Two distinct actor classes can reach `/admin/users`, with **different authority
and different data scope** (see **Data scoping — canonical per-operation
`DataScope`** below):

1. **Env-based platform admin** — email listed in `ADMIN_USER_EMAILS`. This is
   a **platform-admin capability**; combined with an explicit operation
   classification it yields a `platform-global` `DataScope` (full cross-tenant
   reach by design).
2. **Ordinary ABAC-authorized organization admin** — holds the relevant
   `USER_*` business-action grant (`USER_READ` / `USER_UPDATE` /
   `USER_DEACTIVATE` on `RESOURCES.USER`) via `AuthorizationService.can()`. The
   grant only proves the **action type** is allowed. Separately, after that
   business-action check succeeds, `resolveAdminUsersScope(...)` derives an
   `organization` `DataScope` for the caller's verified active organization.
   This actor is **not** a platform admin.

Non-admin authenticated users receive **403 Forbidden**. Unauthenticated requests are rejected by `withNodeProvisioning` before the admin check runs.

### Data scoping — canonical per-operation `DataScope` (OZI-71 Slice 4B)

`checkAdminAccess()` returns `{ allowed, isPlatformAdmin }` and performs the ABAC
**business-action** check only — whether the actor may run `user:read` /
`user:update` / `user:deactivate` in the admin panel at all. It does **not**
decide which rows are in reach.

Which rows are in reach is a **canonical per-operation `DataScope`**, resolved
(once per request, after the ABAC check) by the shared server-only seam
`src/app/api/admin/users/users-admin-scope.ts`
(`resolveAdminUsersScope(access, db)`):

- **ordinary ABAC admin → `organization` `DataScope`**
  `{ kind: 'organization', organizationId, tenantId }` for the caller's
  server-resolved active organization. `organizationId` is proven by a
  membership check; `tenantId` is read **independently** from
  `organizations.tenant_id` (never from `access.tenant.tenantId`).
- **env-based platform admin → `platform-global` `DataScope`**
  `{ kind: 'platform-global' }`, derived through the shipped
  `derivePlatformGlobalScope(...)` with an explicit
  `operation: { kind: 'platform-global' }` classification. This preserves the
  historical unrestricted cross-tenant reach — but through an explicit
  canonical classification, **not** through `null`.
- **`tenant` `DataScope` is not accepted** by this surface — it is excluded
  from `AdminUsersDataScope` at compile time (`users-admin-scope.type-test.ts`).
- The `DrizzleAdminUsersService` boundary **never receives `null`**. An
  ordinary membership denial is handled in the seam / route layer (empty list
  for `GET /api/admin/users`, `404` for the by-id routes), never forwarded as
  an unscoped call.

For an `organization` `DataScope`, containment is enforced **inside the same
SQL statement** as the read/mutation — never a separate "check membership,
then act on id" step — as a correlated `EXISTS`:

```sql
EXISTS (SELECT 1
        FROM memberships m
        JOIN organizations o ON o.id = m.organization_id
        WHERE m.user_id = users.id
          AND m.organization_id = scope.organizationId
          AND o.tenant_id       = scope.tenantId)
```

This gives two separate guarantees:

- **A. Cross-tenant tuple integrity.** `scope.tenantId` is load-bearing, so an
  internally inconsistent tuple — `organizationId` of `ORG_A` paired with the
  `tenantId` of a _different_ tenant (`ORG_A` really belongs to `TENANT_A`,
  the scope carries `TENANT_B`) — matches no row. The scope is not a bearer
  token: possession of a well-shaped object is not authority.
- **B. Same-tenant organization isolation.** `scope.organizationId` is
  load-bearing, so a **valid** `{ ORG_A, TENANT_A }` scope cannot reach a user
  whose membership exists only in `ORG_SIBLING` — **even though**
  `ORG_A.tenant_id === ORG_SIBLING.tenant_id === TENANT_A` — because the
  predicate requires `memberships.organization_id = scope.organizationId`.
  Organization membership never escalates to tenant-wide reach.
- **C. Positive control.** A **valid** `{ ORG_SIBLING, TENANT_A }` scope
  (`ORG_SIBLING` genuinely belongs to `TENANT_A`) correctly reaches members of
  `ORG_SIBLING`. `{ ORG_SIBLING, TENANT_A }` is a consistent canonical tuple,
  not a mismatch.

For `platform-global` there is deliberately no row-containment predicate —
legitimate only because the explicit classification already granted that
authority.

An ABAC-authorized caller who requests a user outside their organization scope
(a sibling organization in the same tenant, or another tenant entirely) gets
exactly the same `404` as a nonexistent id — never a distinguishing `403`,
which would leak existence.

`access.tenant.tenantId` (the legacy collapsed `TenantContext` value) remains
in Slice 4B in the transitional ABAC policy selector passed to
`AuthorizationService.can(...)` and in existing audit/logging metadata
(`recordAdminAuditEvent(...)` and the routes' `logger.info(...)` calls, both
unchanged by this slice). It is **not** canonical `DataScope` authority, **not**
parent-`TenantId` provenance, **not** organization-membership evidence, and
**not** an SQL containment input — it never reaches the canonical Admin Users
scope predicate.

Prior to SEC-26, all four operations used the DI-registered `UserRepository` —
a global, unscoped repository — so any ABAC-authorized tenant owner/admin
could read or mutate any user in any tenant. SEC-26's fix introduced a
scoped `DrizzleAdminUsersService`; OZI-71 Slice 4B replaced that fix's legacy
`AdminUserScope = { tenantId } | null` with the canonical `DataScope` above.
See SEC-26 in `docs/ai/general/SECURITY_CODING_PATTERNS.md`.

### Sibling Admin Surfaces — Invitations and Waitlist (SEC-41)

SEC-26 fixed the tenant scoping of `/api/admin/users/**`, but the same defect
class lived on unchanged in the neighbouring admin routes. SEC-41 is that
follow-through: every route under `src/app/api/admin/**` now has to state, in
code, whether it is a **platform-admin** surface or a **tenant-scoped ABAC**
surface — the two must not share one handler that authorises the action and
then acts on an unscoped id.

**Cause.** Three separate expressions of the same root mistake:

- `DELETE /api/admin/invitations/:id` existed as a _flat_ route — it took an
  invitation id and revoked it, with no organization anywhere in the
  statement. An ABAC-authorized admin of organization A could revoke an
  invitation belonging to organization B by id alone.
- The nested revoke route did a `SELECT` to check the invitation's
  organization and then an `UPDATE ... WHERE id` — authorising against the row
  as it was a moment ago, then writing with no scope of its own.
- `POST /api/auth/waitlist` accepted `organizationId` in the request body of
  an **anonymous** endpoint, letting an unauthenticated caller assign their
  own entry to any tenant.

**Fix.**

- The flat `DELETE /api/admin/invitations/:id` route was **deleted**, not
  patched. A tenant-scoped mutation reached by an id with no tenant in the
  path has no safe form; the nested route under
  `/api/admin/organizations/:organizationId/invitations/:id` is the only
  revoke surface now.
- `InvitationRepository.revokePendingScoped(id, organizationId)` carries the
  organization **and** `status = 'pending'` in the same `UPDATE` predicate, so
  scope, state check and write are one statement. The nested route always
  passes the organization from the path — never `null`, not even for a
  platform admin, because the caller named an organization and
  `getDetailInActiveScope` already proved it is reachable from their scope.
  A no-match returns the same `404` whether the invitation does not exist,
  belongs to another organization, or is no longer pending.
- The waitlist admin routes (`/api/admin/waitlist`, `/api/admin/waitlist/:id`)
  are **platform-admin only**: the ABAC branch is deliberately absent, because
  a waitlist entry is pre-tenant — there is no organization to scope it to, so
  an ABAC grant could only ever be an unscoped one. `organizationId` was
  removed from the anonymous waitlist schema entirely.
- `src/security/core/platform-admin.guard.test.ts` walks `src/app/api/admin/**`
  and fails the build when a route neither separates the platform-admin path
  from the tenant-scoped one nor keeps its writes out of the handler (no inline
  `insert` / `update` / `delete`). The rule is enforced for routes added later,
  not just the ones audited here.

Full writeup: SEC-41 in `docs/ai/general/SECURITY_CODING_PATTERNS.md`.

## API Routes

### `GET /api/admin/users`

Lists all users with pagination and search.

| Parameter | Type     | Default | Max   | Description                        |
| --------- | -------- | ------- | ----- | ---------------------------------- |
| `limit`   | `number` | `50`    | `100` | Clamped silently to 100            |
| `offset`  | `number` | `0`     | —     | Pagination offset                  |
| `search`  | `string` | —       | `200` | Case-insensitive email/name filter |

**Response shape**:

```json
{
  "status": "ok",
  "data": {
    "users": [...],
    "total": 42,
    "limit": 50,
    "offset": 0
  }
}
```

### `GET /api/admin/users/:id`

Returns a single user record. Returns **404** if user not found (IDOR protection — no
403 on not found), and **400** if `:id` is not a syntactically valid UUID (SEC-23 --
validated before any DB call). Returns the same **404** when the id is a real user
outside the caller's `DataScope` (see **Data scoping — canonical per-operation
`DataScope`** above).

### `PATCH /api/admin/users/:id`

Two dispatch modes based on request body:

**Update display name**:

```json
{ "displayName": "New Name" }
```

**Deactivate user**:

```json
{ "action": "deactivate" }
```

Deactivation sets `deactivated_at` timestamp in the DB. This is enforced everywhere,
starting the very next request: both central access evaluators
(`evaluateNodeProvisioningAccess()` for route handlers and RSC layouts,
`createSecurityContext()` for Server Actions) check `deactivatedAt` and deny access
(`FORBIDDEN` / `ACCOUNT_DISABLED`) before onboarding/tenant/membership checks. See
SEC-33 in `docs/ai/general/SECURITY_CODING_PATTERNS.md`. Deactivation does **not**
call any provider API to revoke the underlying Clerk/AuthJS session/JWT itself — for
this repo's AuthJS integration (JWT strategy, no database session adapter) the
per-request DB check above already makes a stale session functionally useless
regardless; IdP-side revocation as additional defense-in-depth is tracked as a
possible enhancement, not required to close access.

## Database Schema

Added `deactivated_at TIMESTAMPTZ` column to the `users` table (migration `0012_users_deactivated_at.sql`).

The `User` contract interface gains `deactivatedAt?: Date` and `createdAt?: Date`.

## Repository Contract Extensions

`UserRepository` (in `src/core/contracts/user.ts`) is extended with `listAll()` and
`deactivate()`, but **the admin routes no longer call it**. `UserRepository` /
`DrizzleUserRepository` remain DI-registered and are used only for self-service
lookups elsewhere in the app (onboarding, bootstrap, `node-provisioning-access.ts`) —
a user reading/updating their own record by their own verified id, where no tenant
scoping applies or is needed.

The admin routes instead use `DrizzleAdminUsersService`
(`src/modules/user/infrastructure/drizzle/DrizzleAdminUsersService.ts`) — directly
instantiated at the route-handler call site (not DI-registered), mirroring
`DrizzleFeatureFlagAdminService`. Every method takes a canonical
`AdminUsersDataScope` — `Extract<DataScope, { kind: 'organization' | 'platform-global' }>`
(no `null`, no `tenant`):

- `listAll(opts, scope)`
- `findById(requestedUserId, scope)`
- `updateProfile(requestedUserId, profile, scope)`
- `deactivate(requestedUserId, deactivatedAt, scope)`

`requestedUserId` is the raw, `z.uuid()`-validated route parameter — it stays a
resource predicate input and is never branded as a canonical `UserId`, and
there is no pre-read to brand it (that would break same-statement
containment).

Because `users` has no `tenant_id`/`organization_id` column of its own, scoping is
enforced via lightweight core-level join references in
`src/core/db/schema/references.ts` — `membershipsReferenceTable` and
`organizationsReferenceTable` (which carries `id` plus a read-only `tenant_id`
for the canonical-tuple check) — so the `user` module can build the correlated
`EXISTS` predicate against `memberships` joined to `organizations` **without
importing the `authorization` module's real Drizzle schema**. These reference
declarations are outside the `drizzle-kit` schema glob: they are query
mappings, never migrated.

## UI

`/admin/users` is an RSC page that renders a client component `UsersClient`. The client component:

- Fetches `/api/admin/users` on mount and on search/pagination changes
- Debounces the search input (300 ms)
- Provides inline display name editing per row
- Provides deactivation per row (for active users only)
- Shows loading skeleton and error state

## Step-Up Required For Mutations (SEC-48)

Deactivating a user and renaming one are state-changing admin operations, so
both go through `withAdminStepUp`: the caller needs a second factor verified
within the last 15 minutes, in the current session. Reads are unaffected.

The requirement does not depend on whether the caller is a platform admin or
an organization admin — that distinction is authorization (SEC-26/SEC-41,
canonical `DataScope` since OZI-71 Slice 4B) and is still enforced separately,
in the same `WHERE` clause as the mutation.

Details: `docs/features/37 - MFA & Step-Up Authentication.md`.

## Security Notes

- **IDOR protection**: `GET /api/admin/users/:id` returns 404 (not 403) when user is not found to avoid enumeration.
- **Cross-tenant IDOR/BOLA (fixed)**: prior to SEC-26, an ABAC-authorized (non-platform-admin) tenant owner/admin could read, rename, or deactivate any user in any tenant — `checkAdminAccess()` only verified the _action_ was allowed, never _whose_ users the caller could reach, and every DB call went through the globally-scoped `UserRepository`. SEC-26 fixed this with a scoped `DrizzleAdminUsersService`; **OZI-71 Slice 4B** then replaced that fix's legacy `AdminUserScope = { tenantId } | null` with a canonical per-operation `DataScope` (`organization` with a load-bearing `organizationId` + `tenantId` tuple, or explicitly-classified `platform-global` — never `null`, never `tenant`), still enforced in the same SQL predicate as each read/mutation. See SEC-26 in `docs/ai/general/SECURITY_CODING_PATTERNS.md`.
- **SEC-23 (UUID validation)**: `:id` is validated with `z.uuid()` before any DB call in both `GET` and `PATCH /api/admin/users/:id` — a malformed id now 400s instead of reaching the DB layer.
- **SEC-41 (sibling admin surfaces)**: the invitations and waitlist admin routes were audited for the same defect class and fixed — the unscoped flat `DELETE /api/admin/invitations/:id` route was removed, the nested revoke moved its scope into the `UPDATE` predicate, and the waitlist admin routes were made platform-admin only. A static guard now enforces the platform-admin/ABAC split across `src/app/api/admin/**`. See **Sibling Admin Surfaces (SEC-41)** above.
- **Pagination clamping**: `limit` is silently capped at 100 (not rejected).
- **PII scope**: Email is displayed in the admin panel. Acceptable for admin-only access.
- **editValues state**: Uses `Map<string, string>` (not plain object) to comply with SEC-15.
- **Audit logging**: All admin mutations log `admin:user_deactivate` and `admin:user_update` events.

## Files Changed

| File                                                                  | Change                                                                                                                                                  |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/core/contracts/user.ts`                                          | Extended `User` interface and `UserRepository` contract (self-service surface only)                                                                     |
| `src/modules/user/infrastructure/drizzle/schema.ts`                   | Added `deactivated_at` column                                                                                                                           |
| `src/modules/user/infrastructure/drizzle/DrizzleUserRepository.ts`    | Self-service (`findById`/`updateProfile`/etc. by the caller's own id); no longer used by the admin routes                                               |
| `src/modules/user/infrastructure/drizzle/DrizzleAdminUsersService.ts` | **New** (SEC-26); OZI-71 Slice 4B — takes a canonical `AdminUsersDataScope` (`organization` \| `platform-global`), canonical-tuple `EXISTS` containment |
| `src/core/db/schema/references.ts`                                    | Added `membershipsReferenceTable` (SEC-26); OZI-71 Slice 4B added `tenant_id` to `organizationsReferenceTable` (read-only, not migrated)                |
| `src/core/db/migrations/generated/0012_users_deactivated_at.sql`      | Migration SQL                                                                                                                                           |
| `src/app/api/admin/users/users-admin-scope.ts`                        | **New** (OZI-71 Slice 4B) — shared seam: `resolveAdminUsersScope`, `AdminUsersScopeInvariantError`                                                      |
| `src/app/api/admin/users/route.ts`                                    | `GET /api/admin/users` — canonical `DataScope`-scoped                                                                                                   |
| `src/app/api/admin/users/[id]/route.ts`                               | `GET` / `PATCH /api/admin/users/:id` — canonical `DataScope`-scoped, UUID-validated                                                                     |
| `src/app/admin/users/page.tsx`                                        | RSC page                                                                                                                                                |
| `src/app/admin/users/UsersClient.tsx`                                 | Client component                                                                                                                                        |
| `src/app/admin/page.tsx`                                              | Users card changed to `status: 'active'`                                                                                                                |

## Tests

| File                                                                          | Type                                                                                                                                            |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/modules/user/infrastructure/drizzle/DrizzleUserRepository.db.test.ts`    | Integration (real DB) — self-service surface                                                                                                    |
| `src/modules/user/infrastructure/drizzle/DrizzleAdminUsersService.db.test.ts` | Integration (real DB) — canonical `DataScope` containment: cross-tenant, same-tenant sibling-org, mismatched canonical tuple, `platform-global` |
| `src/app/api/admin/users/users-admin-scope.test.ts`                           | Unit — scope seam (ordinary → `organization`, platform → `platform-global`, membership denial → `null`, invariant errors)                       |
| `src/app/api/admin/users/users-admin-scope.type-test.ts`                      | Compile-time — `AdminUsersDataScope` accepts `organization` / `platform-global`, rejects `tenant`, wide `DataScope`, `null`                     |
| `src/app/api/admin/users/route.test.ts`                                       | Unit (route handler) — canonical scope forwarded; membership denial → empty list; invariant → 500                                               |
| `src/app/api/admin/users/[id]/route.test.ts`                                  | Unit (route handler) — canonical scope forwarded; scoped miss → 404; SEC-23 UUID regressions; step-up preserved                                 |
| `e2e/admin-users.spec.ts`                                                     | Playwright E2E (UI rendering only — API responses are mocked, does not exercise real scoping)                                                   |
