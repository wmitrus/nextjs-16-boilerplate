# 03 - Next.js Runtime - Summary

## Task Context

- **Task ID**: `2026-04-24-admin-user-management`
- **Task Objective**: Implement `/admin/users` — admin user listing, viewing, deactivation, profile update
- **Current Run Scope**: RSC vs client placement, route handler patterns, dynamic rendering opt-in, caching
- **Status**: COMPLETED
- **Last Updated**: 2026-04-25
- **Related Control Artifacts**: `plan.md`, `intake.md`, `01 - Architecture Guard - Summary.md`, `02 - Security & Auth - Summary.md`

---

## Scope Handled

- RSC page placement for `/admin/users`
- Client component boundary for interactive table + actions
- Route handler patterns for `/api/admin/users`
- Dynamic rendering opt-in strategy
- Caching behavior of admin routes

---

## Inputs Reviewed

- `next.config.ts` — `cacheComponents: true`, `reactCompiler: true`, `turbopackFileSystemCacheForDev: true`
- `src/app/admin/invitations/page.tsx` — reference RSC admin page (uses `getServerRequestLogContext` → `headers()`)
- `src/app/api/admin/invitations/route.ts` — reference admin route handler (uses `await connection()`)
- `src/app/admin/invitations/InvitationsClient.tsx` — reference client component
- `AGENTS.md` — `cacheComponents: true` constraints, `await connection()` pattern

---

## Actions Performed

- Reviewed `cacheComponents: true` constraint — confirmed no `export const dynamic/runtime` allowed
- Verified dynamic opt-in pattern from invitations page — `getServerRequestLogContext()` via `headers()`
- Verified route handler pattern from invitations route — `await connection()` before `getAppContainer()`
- Analyzed client component boundary for interactive table + pagination + actions

---

## Current-State Findings

**RSC Page Pattern** (`src/app/admin/invitations/page.tsx`):

```typescript
// ✅ Pattern to follow for admin/users/page.tsx
await getServerRequestLogContext({ pathname: '/admin/users' });
// ↑ calls await headers() → dynamic rendering established
const container = getAppContainer();
const db = container.resolve<DrizzleDb>(INFRASTRUCTURE.DB);
```

**Route Handler Pattern** (`src/app/api/admin/invitations/route.ts`):

```typescript
// ✅ Pattern to follow for api/admin/users/route.ts
await connection(); // dynamic opt-in MUST be first
const container = getAppContainer();
```

**Banned patterns** (enforced by `cacheComponents: true`):

```typescript
// ❌ Banned — compile-time error with cacheComponents
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
```

---

## Server vs Client Placement

| Component                               | Placement               | Reason                                                                |
| --------------------------------------- | ----------------------- | --------------------------------------------------------------------- |
| `src/app/admin/users/page.tsx`          | RSC (server)            | Initial data fetch, auth check at server time                         |
| `src/app/admin/users/UsersClient.tsx`   | Client (`'use client'`) | Table interactivity, pagination, search input, action buttons, modals |
| `src/app/api/admin/users/route.ts`      | Route handler (Node.js) | `GET /api/admin/users` — list with pagination/search                  |
| `src/app/api/admin/users/[id]/route.ts` | Route handler (Node.js) | `GET/PATCH/DELETE /api/admin/users/:id` — detail, update, deactivate  |

**RSC page responsibility**: Render the `UsersClient` component with initial page/layout structure. Do NOT pre-fetch user list in the RSC page — the client component fetches via the API route (consistent with invitations pattern, avoids double data fetching).

**Client component responsibility**: `UsersClient` manages all data fetching (via `fetch('/api/admin/users')`), pagination state, search state, action confirmation dialogs, and error display.

---

## Dynamic Rendering Opt-In

**RSC page** (`page.tsx`): Use `await getServerRequestLogContext({ pathname: '/admin/users' })` as the first async call.

- This calls `await headers()` internally → satisfies the `cacheComponents: true` dynamic rendering requirement
- Consistent with the invitations page pattern
- Provides correlation ID context for server-side log events

**Route handlers** (`route.ts`, `[id]/route.ts`): Use `await connection()` as the very first statement inside each exported function.

- Route handlers are always dynamic when they call `connection()` or access request data
- `withNodeProvisioning` wraps the handler — `connection()` must be inside the wrapped handler body, NOT before the wrapper

---

## Caching and Rendering

- Admin user list is user-sensitive and auth-sensitive → must NEVER be cached statically
- `await connection()` in route handlers ensures no static response caching
- `await headers()` (via `getServerRequestLogContext`) in RSC page ensures no static page caching
- No `cache: 'force-cache'` on any admin data fetch

---

## Route Structure

```
src/app/
  admin/
    users/
      page.tsx              ← RSC page (server)
      UsersClient.tsx       ← 'use client' component

src/app/api/
  admin/
    users/
      route.ts              ← GET /api/admin/users?limit=50&offset=0&search=...
      [id]/
        route.ts            ← GET, PATCH, DELETE /api/admin/users/:id
```

**No middleware in `src/proxy.ts` changes required** — `/api/admin/*` routes already go through the Node.js security middleware chain.

---

## Key Runtime Constraints

1. `await getServerRequestLogContext(...)` as first statement in `page.tsx` — required for dynamic rendering
2. `await connection()` as first statement in route handler body — required for dynamic rendering
3. No `export const dynamic` or `export const runtime` in any of these files
4. `withNodeProvisioning` wraps the entire route handler function — `connection()` inside the wrapped function, before `getAppContainer()`
5. `UsersClient.tsx` must have `'use client'` directive — all interactivity and data fetching happens client-side via API routes

---

## Artifact Synchronization

- `plan.md`: Next.js Runtime step marked done
- `intake.md`: RSC vs client placement question resolved — consistent with invitations pattern

---

## Open Questions / Blockers

None. All runtime placement decisions are resolved by inspection of the invitations reference implementation.

---

## Handoff Notes

- **Next specialist**: `05 - Validation Strategy`
- **Pattern to follow**: Invitations page + route as the reference implementation
- **What must not be re-decided**:
  - `getServerRequestLogContext` (not bare `connection()`) in RSC pages — for log context + dynamic opt-in
  - `connection()` first in route handler body
  - `UsersClient` is `'use client'` and fetches data via API routes
  - No route segment config exports

---

## Update Log

### Update Entry

- **Date**: 2026-04-25
- **Trigger**: Initial Next.js Runtime review for admin user management task
- **Summary of change**: RSC/client placement, dynamic opt-in, route structure, caching confirmed against invitations reference
- **Sections refreshed**: All
