# Flow Trace Investigation

**Workflow**: Incident Investigation
**Date**: 2026-04-24
**Agent**: Debug Investigation (06)
**Status**: Completed

---

## Entry Points

1. **Browser → `GET /api/auth/session`** — NextAuth.js session polling from `useSession()` hook
2. **`src/proxy.ts`** — evaluates the request against security middleware rules
3. **App Router** — routes to `src/app/api/auth/[...nextauth]/route.ts`

---

## State Transitions

### Expected Flow

```
Browser GET /api/auth/session
→ src/proxy.ts (PUBLIC_ROUTE_PREFIXES match: /api/auth → passes through)
→ App Router: /api/auth/[...nextauth]/route.ts
→ handler() → await connection() → NextAuth(req, ctx, authOptions)
→ NextAuth session lookup → returns JSON { user: ..., expires: ... }
← HTTP 200 application/json
```

### Actual Flow (Broken)

```
Browser GET /api/auth/session
→ src/proxy.ts (PUBLIC_ROUTE_PREFIXES match: /api/auth → passes through, confirmed)
→ App Router: /api/auth/[...nextauth]/route.ts — ROUTE NOT FOUND in current manifest
→ Falls through to Next.js 404 handler
← HTTP 404 text/html (Next.js 404 page)
Browser: "Unexpected token '<'..." → CLIENT_FETCH_ERROR
```

---

## Identity / Tenant Context

Not reached — the request failed before authentication was established.

---

## Redirect Flow

None — the request returned 404, no redirect was involved.

---

## Likely Divergence Points

### Divergence Point 1: Turbopack Cache Corruption

**Location**: Turbopack dev server (`next.config.ts`: `turbopackFileSystemCacheForDev: true`)

**Evidence**:

- `.next/dev/server/app/api/auth/[...nextauth]/route.js` existed from previous session (Apr 20 timestamp)
- `app-paths-manifest.json` for the current dev session did NOT include `/api/auth/[...nextauth]`
- Turbopack's `ensure-page` function failed to match the specific URL `/api/auth/session` to the catch-all route template `/api/auth/[...nextauth]`
- `.next/dev/types/routes.d.ts` was corrupted (malformed JSDoc with JSX fragments inside)

**Root Cause**: `turbopackFileSystemCacheForDev: true` preserved stale Turbopack build artifacts from a prior session. The current session's manifest had a corrupted/incomplete route registry. Turbopack's `ensure-page` URL → catch-all template matching broke for `[...nextauth]` specifically — a known Turbopack bug with cached catch-all routes.

### Divergence Point 2: Dead Module-Level `NextAuth()` Call

**Location**: `src/modules/auth/infrastructure/authjs/auth.ts` (now fixed)

**Evidence** (from prior session — code no longer present):

```typescript
// Dead code — ran NextAuth(authOptions) at module load time
const handler = NextAuth(authOptions);
export { handler }; // never imported anywhere
```

**Analysis**:

- `NextAuth(authOptions)` at module init time creates session management state (JWT/DB adapter initialization)
- This ran as a side-effect on every import of `authOptions`
- In Next.js 16 with `cacheComponents: true`, module-level stateful initialization during static analysis/prerender can produce non-deterministic behavior
- The handler was never imported anywhere — it was unreachable dead code
- It did NOT directly cause the 404, but created risk for prerender-time initialization errors

---

## Root Cause Summary

**Root Cause 1 (Primary)**: Turbopack dev cache corruption — the `[...nextauth]` catch-all route was not registered in the current session's `app-paths-manifest.json`, causing all `/api/auth/*` requests to 404.

**Root Cause 2 (Secondary)**: Dead module-level `NextAuth()` initialization in `auth.ts` — not the direct cause of the 404, but a latent risk for prerender-time issues and a codebase hygiene violation.

**Fix for RC1**: `rm -rf .next && pnpm dev` (clear Turbopack cache)
**Fix for RC2**: Remove the dead `handler` export from `auth.ts` (already applied)

---

## Files Traced

| File                                                   | Role                                                                                 |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `src/proxy.ts`                                         | Security middleware — `/api/auth` in PUBLIC_ROUTE_PREFIXES, passes through correctly |
| `src/app/api/auth/[...nextauth]/route.ts`              | Catch-all NextAuth route — not registered in corrupted manifest                      |
| `src/modules/auth/infrastructure/authjs/auth.ts`       | `authOptions` export — contained dead `handler` export (now removed)                 |
| `.next/dev/server/app/api/auth/[...nextauth]/route.js` | Compiled but stale from Apr 20 session                                               |
| `.next/app-paths-manifest.json`                        | Missing the `[...nextauth]` route entry in current session                           |
| `.next/dev/types/routes.d.ts`                          | Corrupted (malformed JSDoc/JSX)                                                      |
