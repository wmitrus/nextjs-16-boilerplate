# Implementation Plan — Admin User Management

**Task ID**: `2026-04-24-admin-user-management`
**Created**: 2026-04-25
**Status**: READY FOR IMPLEMENTATION

---

## Objective

Implement the `/admin/users` section: admin user listing with pagination/search, user detail view, deactivation, and display name update. Replace `coming-soon` with `active` status on the admin dashboard card.

---

## Pre-Implementation Checklist

- [x] Architecture Guard constraints known
- [x] Security & Auth constraints known
- [x] Next.js Runtime constraints known
- [x] Validation Strategy defined
- [x] `constraints.md` consolidated
- [ ] DB migration generated and applied locally

## Phase 8 — Migration Metadata Reconciliation

### Step 8.1: Repair Drizzle Snapshot Lineage

- [x] Confirm journal entries existed for `0008` through `0012`
- [x] Confirm snapshot chain stopped at `0007_snapshot.json`
- [x] Generate a clean current-schema snapshot in an isolated temp folder
- [x] Add `0013_reconcile_snapshot.sql` as an empty reconciliation migration
- [x] Add `meta/0013_snapshot.json` as the latest current-schema baseline
- [x] Append `0013_reconcile_snapshot` to `meta/_journal.json`

### Step 8.2: Focused Validation

- [x] `pnpm db:generate` returns `No schema changes, nothing to migrate`

## Follow-Up Closure Checklist — Dashboard Polish And E2E Rules

- [x] Header homepage-anchor routing corrected for non-home pages
- [x] Landing-page CTA section now exposes the `pricing` anchor target
- [x] Dashboard tool inventory badge/table styling refined with focused unit coverage
- [x] Raw Playwright script switched to `--reporter=line`
- [x] Repo docs updated to distinguish scenario-runner E2E from raw Playwright
- [x] AI instruction and agent surfaces updated with container DB and reporter rules
- [x] DB isolation finding recorded: container mode remains `5433/app_test`; dev DB contamination attributed to non-scenario execution

---

## Phase 1 — Schema & Contract Extension

### Step 1.1: Generate DB Migration

Add `deactivated_at` column to `users` table.

**File**: New migration file via `pnpm db:generate`

```sql
ALTER TABLE users ADD COLUMN deactivated_at TIMESTAMP WITH TIME ZONE;
```

**Apply**: `pnpm db:migrate` (local dev)

- [ ] Migration file generated
- [ ] Migration applied locally

### Step 1.2: Extend `User` Contract

**File**: `src/core/contracts/user.ts`

Add to `User` interface:

```typescript
readonly deactivatedAt?: Date;
readonly createdAt?: Date;
```

Add to `UserRepository` interface:

```typescript
listAll(options?: {
  limit?: number;
  offset?: number;
  search?: string;
}): Promise<{ users: User[]; total: number }>;

deactivate(id: SubjectId, deactivatedAt: Date): Promise<void>;
```

- [ ] `User` interface extended
- [ ] `UserRepository` interface extended

---

## Phase 2 — Infrastructure

### Step 2.1: Extend `DrizzleUserRepository`

**File**: `src/modules/user/infrastructure/drizzle/DrizzleUserRepository.ts`

Add `listAll()`:

- Drizzle select with `ilike` for search on email or displayName
- Pagination: `limit` + `offset`
- Total count via separate `count()` query or `COUNT(*) OVER()` window function
- Return `{ users: User[], total: number }`

Add `deactivate()`:

- `UPDATE users SET deactivated_at = $deactivatedAt WHERE id = $id`

Update `schema.ts`:

- Add `deactivatedAt: timestamp('deactivated_at', { withTimezone: true })` column to `usersTable`

- [ ] `usersTable` schema updated
- [ ] `listAll()` implemented
- [ ] `deactivate()` implemented

---

## Phase 3 — Admin API Routes

### Step 3.1: `GET/POST /api/admin/users`

**File**: `src/app/api/admin/users/route.ts`

```
GET  /api/admin/users?limit=50&offset=0&search=...
  → 401 if unauthenticated
  → 403 if not admin
  → 200 { users: [...], total: N, limit: 50, offset: 0 }
```

Pattern: Mirror `src/app/api/admin/invitations/route.ts`

- `await connection()` first
- `withNodeProvisioning` wrapper
- `checkAdminAccess` with `isEnvBasedPlatformAdmin` OR `ACTIONS.USER_READ` ABAC check
- Clamp pagination: `limit = Math.min(Number(q.limit) || 50, 100)`, `offset = Math.max(Number(q.offset) || 0, 0)`
- Search: pass `search` param to `userRepo.listAll({ limit, offset, search })`

- [ ] `route.ts` created and passes typecheck

### Step 3.2: `GET/PATCH/POST /api/admin/users/[id]`

**File**: `src/app/api/admin/users/[id]/route.ts`

```
GET    /api/admin/users/:id
  → 404 if not found (IDOR protection)
  → 200 { user: {...} }

PATCH  /api/admin/users/:id
  → Zod: { displayName: z.string().min(1).max(100) }
  → 400 on invalid body
  → 200 on success

POST   /api/admin/users/:id/deactivate
  → OR: PATCH with { action: 'deactivate' }
  → Logs event: 'admin:user_deactivate', userId, adminId, tenantId
  → 200 on success
```

- [ ] `[id]/route.ts` created and passes typecheck

---

## Phase 4 — Admin UI

### Step 4.1: RSC Page

**File**: `src/app/admin/users/page.tsx`

```typescript
export const metadata: Metadata = { title: 'Users — Administration' };

export default async function UsersAdminPage() {
  await getServerRequestLogContext({ pathname: '/admin/users' });
  // No pre-fetch — client handles data
  return (
    <>
      <h1>User Management</h1>
      <UsersClient />
    </>
  );
}
```

- [ ] `page.tsx` created

### Step 4.2: Client Component

**File**: `src/app/admin/users/UsersClient.tsx`

Features:

- `'use client'`
- `useState` for users, total, page, search
- `useEffect` (or form action) to `fetch('/api/admin/users?...')`
- Table with columns: email, displayName, onboardingComplete, deactivatedAt, createdAt, Actions
- Search input (debounced)
- Pagination controls (previous/next)
- Deactivate button → confirmation dialog → `PATCH /api/admin/users/:id` or `POST .../deactivate`
- Edit display name button → inline edit → `PATCH /api/admin/users/:id { displayName }`
- Loading skeleton, error state

- [ ] `UsersClient.tsx` created

### Step 4.3: Update Admin Dashboard Card

**File**: `src/app/admin/page.tsx`

Change `status: 'coming-soon'` → `status: 'active'` for the Users card (line ~183).

- [ ] Admin dashboard Users card activated

---

## Phase 5 — Stale Stub Alignment

### Step 5.1: Update `features/user-management/` Types

**File**: `src/features/user-management/types/index.ts`

Update `User` type to match `core/contracts/user.User` shape (or re-export from contract).

**File**: `src/features/user-management/api/userService.ts`

Update to call `/api/admin/users` (real admin API) instead of the `/api/users` probe.

**File**: `src/features/user-management/components/UserList.tsx`

Update to use `user.email` / `user.displayName` (not `user.name` which doesn't exist).

- [ ] Stale types aligned
- [ ] Stale service aligned
- [ ] Stale component aligned

---

## Phase 6 — Tests

### Step 6.0: Extend DrizzleUserRepository DB Integration Test

**File**: `src/modules/user/infrastructure/drizzle/DrizzleUserRepository.db.test.ts` (extend existing)

Add test cases:

- `listAll()` — returns seeded users with pagination
- `listAll()` — search by email filters correctly
- `listAll()` — returns total count
- `deactivate()` — sets deactivatedAt timestamp
- `listAll()` with deactivated user — deactivatedAt populated in result

Required by AGENTS.md Pattern B (every Drizzle adapter method needs DB integration coverage).

- [ ] `DrizzleUserRepository.db.test.ts` extended with `listAll()` and `deactivate()` cases

### Step 6.1: Route Handler Tests

**File**: `src/app/api/admin/users/route.test.ts`

Cover:

- Unauthenticated → 401
- Not admin → 403
- Admin → 200 with user list
- Pagination clamping (limit > 100)
- Search param forwarded

**File**: `src/app/api/admin/users/[id]/route.test.ts`

Cover:

- GET: user found → 200
- GET: user not found → 404
- PATCH: invalid body → 400
- PATCH: valid displayName → 200
- Deactivate: success → 200
- All: 401 / 403 paths

- [ ] `route.test.ts` written and passing
- [ ] `[id]/route.test.ts` written and passing

---

## Phase 7 — Validation

```bash
pnpm typecheck        # must pass
pnpm lint --fix       # must pass
pnpm test             # all 157+ test files must pass, coverage improve toward 75%
pnpm arch:lint        # must pass
```

- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint --fix` passes
- [ ] `pnpm test` passes
- [ ] `pnpm arch:lint` passes

---

## Phase 8 — Docs

- [ ] `docs/features/35 - Admin User Management.md` created
- [ ] `docs/features/36 - Admin Direct Invitations.md` created (backfill doc debt)

---

## Sequencing Notes

- Phase 1 (schema + contract) must complete before Phase 2 (infrastructure)
- Phase 2 must complete before Phase 3 (API routes)
- Phases 4 and 5 can run in parallel with Phase 3
- Phase 6 (tests) after Phase 3 and Phase 4
- Phase 7 (validation) after all code is written
- Phase 8 (docs) can be last

---

## Risk Notes

| Risk                                                        | Mitigation                                                                |
| ----------------------------------------------------------- | ------------------------------------------------------------------------- |
| Migration not applied → `listAll()` fails with column error | Apply migration before running integration tests                          |
| Coverage still below 75% after new tests                    | Focus on branch coverage in route handlers (401/403/404 paths)            |
| Stale stub changes break existing tests                     | Check `features/user-management/` for existing test files before changing |

---

## Addendum — Test Scope Expansion (Approved 2026-04-25)

### Step 6.2: E2E Playwright Spec

**File**: `e2e/admin-users.spec.ts` (new file)

Minimum E2E coverage following existing patterns:

- `GET /admin/users` — unauthenticated → redirects to sign-in (no credentials required)
- `GET /admin/users` — page loads without error boundary (skip if no admin credentials)
- Page heading "User Management" visible when authenticated as admin
- Search input visible
- User table renders

**Constraints**:

- Skip authenticated tests when `E2E_ADMIN_USER_EMAIL` not set OR env-based admin not configured
- Do NOT test deactivation/edit actions (stateful DB changes — follow-up task)
- Use `getRuntimeProfile()` pattern from existing E2E specs for provider-conditional skip

- [ ] `e2e/admin-users.spec.ts` created and conditionally passing

### Step 6.0: Extend DrizzleUserRepository DB Integration Test

**File**: `src/modules/user/infrastructure/drizzle/DrizzleUserRepository.db.test.ts` (extend)

Required by AGENTS.md Pattern B — add test cases for new methods:

- `listAll()` — returns seeded users paginated
- `listAll()` — search by email filters correctly
- `listAll()` — returns correct total count
- `deactivate()` — sets deactivatedAt timestamp
- Deactivated user — `deactivatedAt` field populated in `listAll()` result

- [ ] DB integration test extended for `listAll()` and `deactivate()`

---

## Phase 5 Decision — Stale Stub Alignment Deferred

**Decision**: `src/features/user-management/` stubs are intentionally left unchanged.

**Rationale**:

- `src/app/users/page.tsx` (the `/users` demo page) uses `{ id, name, email }` from the probe API `/api/users`
- Changing `features/user-management/types/User` would break: `UserList.tsx`, `UserList.test.tsx`, `app/users/page.tsx`, and `e2e/users.spec.ts` E2E mocks
- The admin feature at `/admin/users` is fully self-contained — it uses `AdminUser` type inline in `UsersClient.tsx` and calls `/api/admin/users`
- The `/users` demo page and admin feature are distinct concerns with different data shapes

**Outcome**: Phase 5 skipped. Admin feature is decoupled from the demo feature stubs.
