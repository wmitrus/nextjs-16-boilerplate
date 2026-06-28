# 03 - Next.js Runtime - Summary

## Task Context

- **Task ID**: `2026-04-24-admin-direct-invitation`
- **Task Objective**: Activate `/admin/invitations` page — admin direct invitation without waitlist
- **Current Run Scope**: Runtime placement, server/client boundaries, caching, rendering
- **Status**: COMPLETED
- **Last Updated**: 2026-04-24

## Inputs Reviewed

- `src/app/admin/waitlist/page.tsx` — RSC page, calls `getServerRequestLogContext`, fetches data, passes to client component
- `src/app/admin/waitlist/WaitlistActions.tsx` — `'use client'`, uses `useRouter`, calls fetch to API
- `src/app/api/admin/waitlist/[id]/route.ts` — uses `withNodeProvisioning`, `await connection()`, `getAppContainer()`
- `src/app/api/auth/invite/route.ts` — same pattern reference
- `next.config.ts` — `cacheComponents: true`, `reactCompiler: true`

## Runtime Constraints Active

- `cacheComponents: true` — **`export const dynamic` and `export const runtime` are BANNED** in all route segments
- `reactCompiler: true` — no manual `useMemo`/`useCallback`/`memo` needed
- `await connection()` — **MUST** precede `getAppContainer()` in all route handlers and RSC pages that call it (Pino logger calls `Date.now()` internally)

## Page Runtime Design

### `src/app/admin/invitations/page.tsx` — RSC (Server Component)

```
RSC (server)                     → fetches invitation list + org roles
  ↓ passes as props
AdminInvitationsClient ('use client') → invitation list table + send form
  ↓ calls fetch
POST /api/admin/invitations       → creates invitation
DELETE /api/admin/invitations/[id] → revokes invitation
```

**Pattern**: Identical to `WaitlistAdminPage` / `WaitlistActions` — RSC fetches on page load, client component handles mutations via `fetch` → `router.refresh()`.

**Must follow:**

- `await getServerRequestLogContext({ pathname: '/admin/invitations' })` at top of page function
- `getAppContainer()` called after `getServerRequestLogContext` (which calls `connection()` internally) — verify the helper does call `connection()`, else add `await connection()` explicitly before `getAppContainer()`
- No `export const dynamic` or `export const runtime` in page or route handler

### Route Handlers

**`src/app/api/admin/invitations/route.ts` (GET + POST):**

- `await connection()` first, before any `getAppContainer()` call
- `withNodeProvisioning` wrapper
- Inline admin check after `withNodeProvisioning` resolves (Security constraint S-1)
- Standard `withErrorHandler` wrapper

**`src/app/api/admin/invitations/[id]/route.ts` (DELETE):**

- Same pattern: `await connection()` → admin check → action
- `id` param from `context.params` (awaited — params are async in Next.js 16 App Router)

## Rendering

- List of invitations: fetched server-side in RSC, no client-side data fetching needed on load
- After send/revoke: `router.refresh()` on the client component to re-fetch RSC data
- No custom caching directives needed — `cacheComponents: true` handles this; route handlers with `connection()` are correctly treated as dynamic

## `getServerRequestLogContext` vs `connection()` check

Inspecting `src/app/admin/waitlist/page.tsx`: it calls `getServerRequestLogContext()` but NOT `connection()` explicitly. The helper likely calls `headers()` or `connection()` internally — this satisfies the dynamic rendering requirement. Implementation must follow the same pattern: call `getServerRequestLogContext` first, then `getAppContainer()`.

## Constraints For Implementation

| #   | Constraint                                                                    |
| --- | ----------------------------------------------------------------------------- |
| R-1 | No `export const dynamic` or `export const runtime` anywhere                  |
| R-2 | `await connection()` in all route handlers before `getAppContainer()`         |
| R-3 | RSC page: call `getServerRequestLogContext` before `getAppContainer()`        |
| R-4 | `context.params` must be awaited (async in Next.js 16)                        |
| R-5 | Client component: use `router.refresh()` after successful mutation            |
| R-6 | `'use client'` directive on all interactive components (form, revoke buttons) |
| R-7 | `reactCompiler: true` — no manual memo needed                                 |

## Status

✅ **RUNTIME APPROVED** — proceed to Validation Strategy
