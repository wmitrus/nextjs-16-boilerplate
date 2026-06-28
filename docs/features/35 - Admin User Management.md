# Feature 35 — Admin User Management

## Overview

Adds a protected admin panel at `/admin/users` that allows platform administrators to list, search, update display names, and deactivate registered users.

## Access Control

Access is restricted to platform administrators via **two complementary mechanisms**:

1. **Env-based**: `ADMIN_USER_EMAILS` environment variable — comma-separated list of email addresses that are unconditionally granted admin access.
2. **ABAC-based**: `AuthorizationService.can()` with `RESOURCES.USER` resource and the relevant action (`USER_READ`, `USER_UPDATE`, `USER_DEACTIVATE`).

Non-admin authenticated users receive **403 Forbidden**. Unauthenticated requests are rejected by `withNodeProvisioning` before the admin check runs.

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

Returns a single user record. Returns **404** if user not found (IDOR protection — no 403 on not found).

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

Deactivation sets `deactivated_at` timestamp in the DB. Does **not** revoke Clerk sessions — that is a separate concern.

## Database Schema

Added `deactivated_at TIMESTAMPTZ` column to the `users` table (migration `0012_users_deactivated_at.sql`).

The `User` contract interface gains `deactivatedAt?: Date` and `createdAt?: Date`.

## Repository Contract Extensions

`UserRepository` (in `src/core/contracts/user.ts`) extended with:

- `listAll(opts: { limit: number; offset: number; search?: string }): Promise<{ users: User[]; total: number }>`
- `deactivate(id: string, deactivatedAt: Date): Promise<void>`

## UI

`/admin/users` is an RSC page that renders a client component `UsersClient`. The client component:

- Fetches `/api/admin/users` on mount and on search/pagination changes
- Debounces the search input (300 ms)
- Provides inline display name editing per row
- Provides deactivation per row (for active users only)
- Shows loading skeleton and error state

## Security Notes

- **IDOR protection**: `GET /api/admin/users/:id` returns 404 (not 403) when user is not found to avoid enumeration.
- **Pagination clamping**: `limit` is silently capped at 100 (not rejected).
- **PII scope**: Email is displayed in the admin panel. Acceptable for admin-only access.
- **editValues state**: Uses `Map<string, string>` (not plain object) to comply with SEC-15.
- **Audit logging**: All admin mutations log `admin:user_deactivate` and `admin:user_update` events.

## Files Changed

| File                                                               | Change                                                  |
| ------------------------------------------------------------------ | ------------------------------------------------------- |
| `src/core/contracts/user.ts`                                       | Extended `User` interface and `UserRepository` contract |
| `src/modules/user/infrastructure/drizzle/schema.ts`                | Added `deactivated_at` column                           |
| `src/modules/user/infrastructure/drizzle/DrizzleUserRepository.ts` | Implemented `listAll()` and `deactivate()`              |
| `src/core/db/migrations/generated/0012_users_deactivated_at.sql`   | Migration SQL                                           |
| `src/app/api/admin/users/route.ts`                                 | `GET /api/admin/users`                                  |
| `src/app/api/admin/users/[id]/route.ts`                            | `GET` / `PATCH /api/admin/users/:id`                    |
| `src/app/admin/users/page.tsx`                                     | RSC page                                                |
| `src/app/admin/users/UsersClient.tsx`                              | Client component                                        |
| `src/app/admin/page.tsx`                                           | Users card changed to `status: 'active'`                |

## Tests

| File                                                                       | Type                  |
| -------------------------------------------------------------------------- | --------------------- |
| `src/modules/user/infrastructure/drizzle/DrizzleUserRepository.db.test.ts` | Integration (real DB) |
| `src/app/api/admin/users/route.test.ts`                                    | Unit (route handler)  |
| `src/app/api/admin/users/[id]/route.test.ts`                               | Unit (route handler)  |
| `e2e/admin-users.spec.ts`                                                  | Playwright E2E        |
