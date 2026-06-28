# Incident Intake

**Workflow**: Incident Investigation
**Date**: 2026-04-24
**Agent**: Debug Investigation (06)
**Status**: Completed

---

## Symptom

`[next-auth][error][CLIENT_FETCH_ERROR]` on every page load. The error read:

```text
Unexpected token '<', "<!DOCTYPE ..." is not valid JSON
```

This caused the NextAuth.js session hook to fail — `useSession()` returned an error state instead of a valid session, breaking all session-dependent UI on every page.

## Environment

- **Next.js**: 16.2.1 with Turbopack (`turbopackFileSystemCacheForDev: true`)
- **NextAuth.js**: v4 credentials provider with custom rate-limiting wrapper
- **Mode**: Local dev (`pnpm dev`)
- **Auth module**: `src/modules/auth/infrastructure/authjs/auth.ts`
- **Route**: `src/app/api/auth/[...nextauth]/route.ts`

## Reproduction Steps

1. Start dev server with `pnpm dev`
2. Navigate to `http://localhost:3000`
3. Browser console shows `[next-auth][error][CLIENT_FETCH_ERROR]`
4. Network tab shows `GET /api/auth/session` returns HTTP 404 with HTML (the 404 page), not JSON

## Logs / Evidence

```text
curl http://localhost:3000/api/auth/session
→ HTTP 404 with HTML "<!DOCTYPE html>..." (Next.js 404 page)
```

Turbopack dev server trace:

```text
ensure-page /api/auth/session → failed
compile-path /api/auth/[...nextauth] → ran but route not added to session manifest
```

`.next/dev/server/app/api/auth/[...nextauth]/route.js` — file existed from prior session (Apr 20 build).
`app-paths-manifest.json` — route absent from current session's manifest.
`.next/dev/types/routes.d.ts` — corrupted (malformed JSDoc with JSX fragments inside).

## Secondary Finding

`src/modules/auth/infrastructure/authjs/auth.ts` line (now removed) had:

```typescript
const handler = NextAuth(authOptions); // MODULE-LEVEL — ran on every import
export { handler }; // never imported anywhere — dead code
```

This module-level call ran `NextAuth(authOptions)` as a side-effect whenever ANY file imported `authOptions`. The handler was never imported. Pure dead code that caused Next.js 16 static analysis issues.

## Impact

- **Severity**: Critical (all session-dependent pages broken in dev)
- **Scope**: All local dev sessions where Turbopack cache was preserved across restarts
- **Production**: Not directly affected (Vercel does clean builds), but the dead `handler` export was a risk for prerender-time initialization errors

## Open Questions at Intake

- Q: Is the route actually registered at runtime or is this a Turbopack cache-only issue?
- Q: Does the module-level `NextAuth()` call contribute to the 404?
- A (resolved): Both root causes confirmed — see Flow Trace Investigation
