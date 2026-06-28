# Runtime Behavior Review

**Workflow**: Incident Investigation
**Date**: 2026-04-24
**Agent**: Next.js Runtime (03)
**Status**: Completed

---

## Objective

Analyze whether the `[...nextauth]` catch-all route failure and the module-level `NextAuth()` call have runtime-level explanations in Next.js 16 / Turbopack, and confirm the fix is runtime-correct.

---

## Configuration Context

```typescript
// next.config.ts (key settings)
cacheComponents: true,           // Cache Components model — PPR-compatible
reactCompiler: true,             // React Compiler active
turbopackFileSystemCacheForDev: true, // Filesystem cache preserved across dev restarts
```

**Critical constraint**: `cacheComponents: true` bans `export const dynamic` and `export const runtime` in any App Router segment. The `[...nextauth]/route.ts` uses `await connection()` (correct pattern) — no route segment configs present.

---

## Server vs Client Boundaries

The affected file is `src/app/api/auth/[...nextauth]/route.ts` — a Node.js route handler.

- **Placement**: Correct. Route handlers run server-side only.
- **`await connection()`**: Present at the start of `handler()`. This correctly opts the route into dynamic rendering (satisfies the `cacheComponents: true` requirement).
- No client-side code in the affected path.

---

## App Router — Catch-All Route Behavior

`src/app/api/auth/[...nextauth]/route.ts` uses the `[...nextauth]` catch-all segment.

**Turbopack catch-all matching issue**:
In Next.js 16.x with `turbopackFileSystemCacheForDev: true`, the dev server preserves Turbopack's compiled output and route manifest across process restarts. When the filesystem cache is present from a prior dev session, the current session's `app-paths-manifest.json` may not include all routes — particularly catch-all routes (`[...slug]`) that have stale compiled artifacts from a different session.

**Observed behavior**:

- The compiled artifact `.next/dev/server/app/api/auth/[...nextauth]/route.js` existed (Apr 20 timestamp)
- The current session manifest did NOT list the route
- Turbopack's `ensure-page` function failed to resolve `/api/auth/session` → `/api/auth/[...nextauth]`
- Result: 404 for all `/api/auth/*` requests

**Correct fix**: `rm -rf .next` before starting a fresh dev session. The filesystem cache should not be trusted after code changes that affect route structure.

---

## Proxy / Middleware Behavior

`src/proxy.ts` is the middleware-equivalent for this repository (not `middleware.ts`).

**Matcher** (`proxy.ts` config):

```typescript
matcher: [
  '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|...)...).*)',
  '/(api|trpc)(.*)',
];
```

The `/api/auth/session` request matches `/(api|trpc)(.*)` and is processed by the proxy. The proxy runs security middleware but does NOT block `/api/auth/*` routes — they pass through for the App Router to handle.

**Conclusion**: The proxy was NOT involved in the 404. The failure was entirely within Turbopack route resolution.

---

## Dead Module-Level Initialization Analysis

The removed code:

```typescript
// src/modules/auth/infrastructure/authjs/auth.ts — BEFORE FIX
const handler = NextAuth(authOptions); // Ran at module import time
export { handler }; // Never imported anywhere
```

**Runtime risk assessment**:

| Risk                          | Analysis                                                                                                                                                                                                                                           |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Static prerender pollution    | `NextAuth(authOptions)` at module level creates JWT/session management state. In Next.js 16 prerender mode, module-level stateful SDK initialization can trigger when the module is analyzed — potentially running before a `connection()` opt-in. |
| `Date.now()` during prerender | NextAuth internally calls `Date.now()` for token expiry. If `auth.ts` is imported from a prerenderable RSC context (e.g., a layout), this would trigger the prerender error (same pattern as Pino/New Relic).                                      |
| Dead export confusion         | The `handler` export was never used — importing it anywhere would double-initialize NextAuth.                                                                                                                                                      |
| HMR instability               | Module-level stateful calls are re-executed on hot reload, potentially creating session management conflicts in dev.                                                                                                                               |

**Verdict**: The dead code was not the direct cause of the 404, but it was a latent risk for prerender errors and HMR instability. Removal was correct and necessary.

---

## Caching and Rendering

`/api/auth/session` must always be dynamic. The route handler uses `await connection()` which is the correct dynamic opt-in under `cacheComponents: true`. No caching concerns with this route.

---

## Summary of Runtime Findings

| Finding                                              | Severity   | Status                   |
| ---------------------------------------------------- | ---------- | ------------------------ |
| Turbopack stale cache causing 404 on `[...nextauth]` | Critical   | ✅ Fixed (clear `.next`) |
| Dead `NextAuth()` module-level init in `auth.ts`     | Major      | ✅ Fixed (removed)       |
| `await connection()` present in route handler        | ✅ Correct | No change needed         |
| No `export const dynamic/runtime` in route handler   | ✅ Correct | No change needed         |
| Proxy correctly passes `/api/auth/*` routes          | ✅ Correct | No change needed         |

---

## Recommended Dev Workflow Note

When `turbopackFileSystemCacheForDev: true` is active, **always run `rm -rf .next` before restarting the dev server** after any of:

- Route structure changes (new/renamed route files)
- Next.js version upgrades
- Turbopack configuration changes
- Persistent 404/routing anomalies in dev

This is a known Turbopack filesystem cache limitation in Next.js 16.x.
