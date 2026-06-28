# 05 - Validation Strategy - Summary

## Task Context

- **Task ID**: `2026-04-24-admin-user-management`
- **Task Objective**: Implement `/admin/users` — admin user listing, viewing, deactivation, profile update
- **Current Run Scope**: Test scope, coverage requirements, validation sequencing for admin user management
- **Status**: COMPLETED
- **Last Updated**: 2026-04-25
- **Related Control Artifacts**: `plan.md`, `intake.md`, `01-03 specialist summaries`

---

## Scope Handled

- Test scope for new route handlers and RSC page
- Test depth for auth gate, pagination, search, IDOR, deactivation
- Coverage impact from stale `features/user-management/` stub changes

---

## Inputs Reviewed

- `src/app/api/admin/invitations/route.test.ts` — reference test for admin route handler
- `src/app/api/admin/invitations/[id]/route.test.ts` — reference for parameterized route test
- `vitest.unit.config.ts` — unit test config, 75% coverage threshold
- `01 - Architecture Guard - Summary.md` — lists what files change
- `02 - Security & Auth - Summary.md` — auth scenarios, IDOR, pagination clamping
- `03 - Next.js Runtime - Summary.md` — placement decisions

---

## Change Risk Classification

**Risk Level**: Medium

- New route handlers with auth gates, DB queries, pagination, search (security-sensitive paths)
- New client component (lower risk — client-side state management only)
- New RSC page (low risk — no complex logic, just layout + auth check)
- Stale stub alignment in `features/user-management/` (low risk — types only, no behavior change)
- Schema migration for `deactivated_at` (low-medium — additive, non-breaking, must not be missed in tests)

---

## Minimum Required Validation

### 1. Unit Tests — Route Handlers (Must Have)

**`src/app/api/admin/users/route.test.ts`** (new file):

Pattern: Mirror `src/app/api/admin/invitations/route.test.ts` exactly.

Must cover:

- `GET /api/admin/users` — unauthenticated → 401
- `GET /api/admin/users` — not admin → 403
- `GET /api/admin/users` — admin (env-based) → 200 with paginated user list
- `GET /api/admin/users` — pagination params clamped (limit > 100 → capped at 100)
- `GET /api/admin/users` — search param passed to DB query

**`src/app/api/admin/users/[id]/route.test.ts`** (new file):

Must cover:

- `GET /api/admin/users/:id` — user found → 200
- `GET /api/admin/users/:id` — user not found → 404 (IDOR protection)
- `PATCH /api/admin/users/:id` — invalid body → 400
- `PATCH /api/admin/users/:id` — valid displayName → 200
- `POST /api/admin/users/:id/deactivate` (or `PATCH` with action) — user deactivated → 200
- All above: unauthenticated → 401, not admin → 403

### 2. TypeScript + Lint (Must Run)

```bash
pnpm typecheck
pnpm lint --fix
```

Must pass before considering implementation complete.

### 3. Existing Tests Must Continue to Pass

```bash
pnpm test
```

Stale stub changes in `features/user-management/` must not break existing tests. Check that `UserList.tsx` and `userService.ts` changes don't have existing test coverage that needs updating.

---

## Optional Additional Validation

| Check                                                  | Rationale                                                 | Priority |
| ------------------------------------------------------ | --------------------------------------------------------- | -------- |
| `pnpm arch:lint`                                       | Confirm no circular deps from new admin API imports       | Medium   |
| Storybook story for `UsersClient`                      | Visual testing for table + action UI                      | Low      |
| Integration test for `DrizzleUserRepository.listAll()` | DB-level test for pagination, search, deactivation filter | Medium   |

---

## Validation Not Required

| Skip                            | Reason                                                                                                    |
| ------------------------------- | --------------------------------------------------------------------------------------------------------- |
| E2E Playwright spec             | Admin user management is in-browser only for platform admins; env-gated; E2E added as follow-up if needed |
| Migration regression test       | Migration is additive; existing DB tests continue with `deactivatedAt` as nullable                        |
| Full coverage for `UsersClient` | Client component with standard React state patterns; test doubles for fetch calls are acceptable          |

---

## Test Mock Pattern (from Reference)

```typescript
const mocks = vi.hoisted(() => ({
  connection: vi.fn().mockResolvedValue(undefined),
  resolveAccess: vi.fn(),
  isEnvAdmin: vi.fn(),
  listAll: vi.fn(),
  findById: vi.fn(),
  deactivate: vi.fn(),
  updateProfile: vi.fn(),
  container: { resolve: vi.fn() },
}));

vi.mock('next/server', async () => {
  const actual = await vi.importActual('next/server');
  return { ...actual, connection: mocks.connection };
});
vi.mock('@/security/core/node-provisioning-runtime', () => ({
  resolveNodeProvisioningAccess: mocks.resolveAccess,
}));
vi.mock('@/security/core/platform-admin', () => ({
  isEnvBasedPlatformAdmin: mocks.isEnvAdmin,
}));
vi.mock('@/core/runtime/bootstrap', () => ({
  getAppContainer: () => mocks.container,
}));
```

---

## Coverage Impact

Current baseline (pre-implementation):

- Functions: 73.79% (threshold 75% — below)
- Branches: 71.73% (threshold 75% — below)

New route handler tests should improve coverage for:

- Auth gate branches (unauthenticated, not-admin, allowed paths)
- Pagination boundary conditions
- 404 not-found path in `[id]` handler

Net expected improvement: functions and branches both closer to threshold. Implementation team should aim to bring coverage above 75% with the new tests.

---

## Validation Sequencing

```
1. pnpm typecheck           (after all files written)
2. pnpm lint --fix          (after typecheck)
3. pnpm test                (full suite — confirm no regression + new tests pass)
4. pnpm arch:lint           (confirm no circular deps)
5. Manual: GET /api/admin/users in browser or curl (smoke test)
```

---

## Handoff Notes

- **Next specialist**: `04 - Implementation Agent`
- **Test reference**: `src/app/api/admin/invitations/route.test.ts` is the canonical pattern
- **Must not be re-decided**:
  - Route handler tests are required (not optional)
  - `vi.mock('next/server', async () => { const actual = await vi.importActual(...); })` — Pattern G from AGENTS.md
  - IDOR 404 (not 403) must be tested explicitly
  - Pagination clamping (limit > 100) must be tested
