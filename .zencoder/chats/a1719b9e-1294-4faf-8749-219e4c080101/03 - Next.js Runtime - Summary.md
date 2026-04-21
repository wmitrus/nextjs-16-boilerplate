# 03 - Next.js Runtime - Summary

## Task Context

- **Task ID**: `a1719b9e-1294-4faf-8749-219e4c080101`
- **Task Objective**: Runtime review for password reset flow implementation
- **Current Run Scope**: Phase 2 — new auth route handlers, new pages, reset-password with token searchParam
- **Status**: COMPLETED
- **Last Updated**: 2026-04-21
- **Related Control Artifacts**: `plan.md`, `01 - Architecture Guard - Summary.md`, `02 - Security & Auth - Summary.md`

---

## Scope Handled

- **Runtime entrypoints reviewed**: New route handlers (`/api/auth/forgot-password`, `/api/auth/reset-password`), new pages (`/auth/forgot-password`, `/auth/reset-password`), modified sign-in page
- **App Router surfaces reviewed**: All new auth pages follow existing `page.tsx` + Suspense boundary + client component pattern
- **Runtime questions in scope**: Node vs Edge placement; `connection()` usage; `searchParams` in reset-password page; caching behavior; token parameter handling

---

## Inputs Reviewed

- **Code paths reviewed**:
  - `src/app/auth/signin/page.tsx` (existing, pattern reference)
  - `src/app/auth/signup/page.tsx` (existing, pattern reference)
  - `src/app/auth/set-password/page.tsx` (Phase 1, to be removed)
  - `src/app/api/auth/signup/route.ts` (existing, pattern reference)
- **Earlier task artifacts reviewed**: Architecture Guard Summary, Security Agent Summary

---

## Current-State Findings

### Route Handlers — Node Runtime Required

All new auth API routes (`/api/auth/forgot-password`, `/api/auth/reset-password`) use:

- `bcryptjs` (Node-only binary)
- `crypto.randomBytes()` (Node built-in)
- Drizzle ORM DB operations (Node-only driver)

These are Node runtime dependencies. The `cacheComponents: true` constraint in `next.config.ts`
bans `export const runtime = 'nodejs'`. Use `await connection()` at the top of each handler to
opt into dynamic rendering and ensure Node runtime — this is already the established pattern
in `signup/route.ts`.

### Pages — `connection()` Is Mandatory

All new auth pages that read searchParams or call `getServerSession` must call `await connection()`
before any dynamic data access. The existing `signin/page.tsx` uses this pattern correctly.

**`/auth/reset-password/page.tsx` specific requirement**: This page reads a `token` query param
from `searchParams`. In Next.js 16 with `cacheComponents: true`, `searchParams` is a Promise
that must be awaited — consistent with how `signin/page.tsx` handles `callbackUrl` and `error`.
The Suspense boundary pattern is mandatory (existing pages all use it).

### Suspense Boundary Pattern

All new auth pages must follow the same pattern as existing auth pages:

```typescript
export default function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  return (
    <Suspense fallback={null}>
      <ResetPasswordPageContent searchParams={searchParams} />
    </Suspense>
  );
}
```

### Token in URL — Security Note (Runtime Concern)

The reset token will be in the URL as a query parameter (`/auth/reset-password?token=xxx`).
This is the industry standard. Runtime considerations:

- Next.js does NOT cache pages with dynamic query params when `connection()` is called — safe
- Token must be consumed (marked used) before the password is updated — not after
- The page should not render the raw token in any server-side logs (it appears in `searchParams`)
- The route handler receives the token in the POST body, not URL — correct pattern

### Caching Behavior

- `/api/auth/forgot-password` and `/api/auth/reset-password` are route handlers — they are
  dynamic by default when they use `await connection()`
- Auth pages with `await connection()` + `getServerSession()` are dynamic — not cached
- No caching concern for auth flows

---

## Runtime Boundary Assessment

- **Server vs client**: Pages are server components with client forms (same pattern as existing auth pages)
- **Edge vs Node**: Node runtime required for all new routes (bcrypt + crypto + Drizzle)
- **Route handler responsibilities**: Validate input, generate/validate token, hash operations, DB writes
- **Proxy (`src/proxy.ts`) responsibilities**: No changes needed — `/api/auth/*` is already in PUBLIC_ROUTE_PREFIXES

---

## Runtime Decisions / Constraints

### Approved Runtime Constraints

1. All new route handlers: `await connection()` as first statement
2. All new pages: `await connection()` in the inner async function (before `searchParams` access)
3. All new pages: Suspense boundary pattern wrapping the inner content component
4. `searchParams` typed as `Promise<{ token?: string }>` in reset-password page
5. Token passed from page to client component via props (not in URL client-side)
6. No `export const runtime` or `export const dynamic` — banned by `cacheComponents: true`

### Rejected Directions

1. **Edge runtime for auth routes** — incompatible with bcrypt and Drizzle
2. **Token in URL on the client-side navigation** — token is in initial page URL only; client form POSTs to API
3. **Skipping Suspense boundary** — required for pages that read searchParams

---

## Open Questions / Blockers

- None for Phase 2
- Email delivery mechanism is out of scope; dev-mode token in response body is the interim solution

---

## Handoff Notes

- **Implementation Agent must**: Follow `await connection()` + Suspense pattern for all new pages;
  never use `export const runtime` or `export const dynamic`; ensure token arrives in POST body (not URL)
  for the reset-password API endpoint
- **Do not re-decide**: Node runtime placement, Suspense pattern, `connection()` usage
- **Next specialist**: Constraints consolidation → Implementation Plan → Implementation

---

## Update Log

### 2026-04-21 — Phase 2 Runtime Review

- Trigger: Architecture design completed; runtime implications identified
- Summary: All new routes and pages confirmed as Node runtime; Suspense + connection() pattern confirmed
- Sections refreshed: All
