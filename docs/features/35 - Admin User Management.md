# Feature 35 — Admin User Management

## Overview

Adds a protected admin panel at `/admin/users` that allows platform administrators to list, search, update display names, and deactivate registered users.

## Access Control

Access is restricted to platform administrators via **two complementary mechanisms**:

1. **Env-based**: `ADMIN_USER_EMAILS` environment variable — comma-separated list of email addresses that are unconditionally granted admin access. Unscoped: full cross-tenant reach by design.
2. **ABAC-based**: `AuthorizationService.can()` with `RESOURCES.USER` resource and the relevant action (`USER_READ`, `USER_UPDATE`, `USER_DEACTIVATE`). Scoped: the grant only proves the action type is allowed, never which tenant's users it applies to (see **Tenant Scoping** below).

Non-admin authenticated users receive **403 Forbidden**. Unauthenticated requests are rejected by `withNodeProvisioning` before the admin check runs.

### Tenant Scoping (cross-tenant IDOR fix)

`checkAdminAccess()` returns `{ allowed, isPlatformAdmin }`, mirroring the Feature
Flags admin surface (SEC-26). All three route handlers derive a scope from this:

```typescript
const scope = adminAccess.isPlatformAdmin
  ? null
  : { tenantId: access.tenant.tenantId };
```

`null` means unrestricted (platform admin only). A non-null `{ tenantId }` is passed
into every `DrizzleAdminUsersService` call and is enforced **inside the same SQL
statement** as the read or mutation, via a correlated `EXISTS` against `memberships`
(`memberships.organization_id = tenantId AND memberships.user_id = users.id`) — not as
a separate "check membership, then act on id" step. `tenantId` here is the
organization UUID; `TenantContext.tenantId` and `TenantContext.organizationId` hold
the same value (see `src/core/contracts/tenancy.ts`).

An ABAC-authorized (non-platform-admin) caller who requests a user outside their own
tenant gets exactly the same `404` as a nonexistent id — never a distinguishing `403`,
which would leak cross-tenant existence.

Prior to this fix, all four operations (`listAll`, `findById`, `updateProfile`,
`deactivate`) used the DI-registered `UserRepository` — a global, unscoped
repository with no tenant concept at all — so any ABAC-authorized tenant
owner/admin could read or mutate **any user in any tenant**. See SEC-26 in
`docs/ai/general/SECURITY_CODING_PATTERNS.md` for the full writeup.

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
outside the caller's tenant (see Tenant Scoping above).

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
`DrizzleFeatureFlagAdminService`. Every method takes an `AdminUserScope` (`{
tenantId: string } | null`):

- `listAll(opts, scope)`
- `findById(id, scope)`
- `updateProfile(id, profile, scope)`
- `deactivate(id, deactivatedAt, scope)`

Because `users` has no `tenant_id`/`organization_id` column of its own, scoping is
enforced via a lightweight core-level join reference,
`membershipsReferenceTable` (`src/core/db/schema/references.ts`, mirroring the
already-established `usersReferenceTable` pattern), so the `user` module can build a
correlated `EXISTS` predicate against `memberships` without importing the
`authorization` module's real Drizzle schema.

## UI

`/admin/users` is an RSC page that renders a client component `UsersClient`. The client component:

- Fetches `/api/admin/users` on mount and on search/pagination changes
- Debounces the search input (300 ms)
- Provides inline display name editing per row
- Provides deactivation per row (for active users only)
- Shows loading skeleton and error state

## Security Notes

- **IDOR protection**: `GET /api/admin/users/:id` returns 404 (not 403) when user is not found to avoid enumeration.
- **Cross-tenant IDOR/BOLA (fixed)**: prior to this fix, an ABAC-authorized (non-platform-admin) tenant owner/admin could read, rename, or deactivate any user in any tenant — `checkAdminAccess()` only verified the _action_ was allowed, never _whose_ users the caller could reach, and every DB call went through the globally-scoped `UserRepository`. Fixed by deriving an `AdminUserScope` from `isPlatformAdmin` and enforcing it in the same SQL predicate as each read/mutation via `DrizzleAdminUsersService`. See SEC-26 in `docs/ai/general/SECURITY_CODING_PATTERNS.md`.
- **SEC-23 (UUID validation)**: `:id` is validated with `z.uuid()` before any DB call in both `GET` and `PATCH /api/admin/users/:id` — a malformed id now 400s instead of reaching the DB layer.
- **SEC-41 (sibling admin surfaces)**: the invitations and waitlist admin routes were audited for the same defect class and fixed — the unscoped flat `DELETE /api/admin/invitations/:id` route was removed, the nested revoke moved its scope into the `UPDATE` predicate, and the waitlist admin routes were made platform-admin only. A static guard now enforces the platform-admin/ABAC split across `src/app/api/admin/**`. See **Sibling Admin Surfaces (SEC-41)** above.
- **Pagination clamping**: `limit` is silently capped at 100 (not rejected).
- **PII scope**: Email is displayed in the admin panel. Acceptable for admin-only access.
- **editValues state**: Uses `Map<string, string>` (not plain object) to comply with SEC-15.
- **Audit logging**: All admin mutations log `admin:user_deactivate` and `admin:user_update` events.

## Files Changed

| File                                                                  | Change                                                                                                    |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `src/core/contracts/user.ts`                                          | Extended `User` interface and `UserRepository` contract (self-service surface only)                       |
| `src/modules/user/infrastructure/drizzle/schema.ts`                   | Added `deactivated_at` column                                                                             |
| `src/modules/user/infrastructure/drizzle/DrizzleUserRepository.ts`    | Self-service (`findById`/`updateProfile`/etc. by the caller's own id); no longer used by the admin routes |
| `src/modules/user/infrastructure/drizzle/DrizzleAdminUsersService.ts` | **New** — tenant-scoped admin CRUD surface used by `/api/admin/users/**`                                  |
| `src/core/db/schema/references.ts`                                    | Added `membershipsReferenceTable` (core-level join reference)                                             |
| `src/core/db/migrations/generated/0012_users_deactivated_at.sql`      | Migration SQL                                                                                             |
| `src/app/api/admin/users/route.ts`                                    | `GET /api/admin/users` — now tenant-scoped                                                                |
| `src/app/api/admin/users/[id]/route.ts`                               | `GET` / `PATCH /api/admin/users/:id` — now tenant-scoped, UUID-validated                                  |
| `src/app/admin/users/page.tsx`                                        | RSC page                                                                                                  |
| `src/app/admin/users/UsersClient.tsx`                                 | Client component                                                                                          |
| `src/app/admin/page.tsx`                                              | Users card changed to `status: 'active'`                                                                  |

## Tests

| File                                                                          | Type                                                                                                 |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `src/modules/user/infrastructure/drizzle/DrizzleUserRepository.db.test.ts`    | Integration (real DB) — self-service surface                                                         |
| `src/modules/user/infrastructure/drizzle/DrizzleAdminUsersService.db.test.ts` | Integration (real DB) — cross-tenant IDOR regression coverage                                        |
| `src/app/api/admin/users/route.test.ts`                                       | Unit (route handler) — includes SEC-26 tenant-scoping regression                                     |
| `src/app/api/admin/users/[id]/route.test.ts`                                  | Unit (route handler) — includes SEC-26 tenant-scoping + SEC-23 UUID regressions                      |
| `e2e/admin-users.spec.ts`                                                     | Playwright E2E (UI rendering only — API responses are mocked, does not exercise real tenant scoping) |
