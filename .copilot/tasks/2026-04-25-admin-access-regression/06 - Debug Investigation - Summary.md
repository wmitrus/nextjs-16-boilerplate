# 06 — Debug Investigation Summary

**Task**: Admin Access Regression — CLIENT_FETCH_ERROR Root Cause  
**Date**: 2026-04-25  
**Status**: Complete

## Investigation Scope

User reported: visiting `/admin` redirects to home page after admin user management implementation. Browser console shows `[next-auth][error][CLIENT_FETCH_ERROR] "Unexpected token '<', "<!DOCTYPE "... is not valid JSON"`.

## Evidence Gathered

### Symptom Chain (verified)

```text
curl http://localhost:3000/api/auth/session → 404 HTML (<!DOCTYPE html>)
curl http://localhost:3000/api/auth/providers → 404 HTML
curl http://localhost:3000/ → 200 OK
```

### Turbopack Cache Analysis

The `.next/dev/server/chunks/` contained stale compiled versions of `auth.ts`:

```text
[root-of-the-server]__0~u.bez._.js  (Apr 20, contains: const handler = NextAuth(authOptions))
[root-of-the-server]__0e5-2yb._.js  (Apr 25, does NOT have module-level handler — compiled AFTER fix)
```

The route manifest DID list the `[...nextauth]` route. But the route was returning 404 because:

- The compiled route module loaded `auth.ts` from a cached chunk
- That stale chunk had `const handler = NextAuth(authOptions)` at module level
- This call fails or produces an initializer crash in Next.js 16 App Router context
- Turbopack marks the route as failed → returns 404 for all `/api/auth/*` endpoints

### Confirming Fix

```bash
touch src/app/api/auth/[...nextauth]/route.ts
# Force Turbopack to recompile route.ts from current source (auth.ts without module-level handler)
curl http://localhost:3000/api/auth/session → 200 {} (valid JSON)
```

### Root Cause Classification

**Turbopack filesystem cache stale after transitive dependency change** — `auth.ts` was modified (module-level `NextAuth()` call removed) but `route.ts` was not touched. Turbopack did not invalidate the route handler cache, serving the old compiled version of `auth.ts`.

**Underlying code defect**: Module-level `NextAuth(authOptions)` call in `auth.ts` — a Pages Router pattern incompatible with App Router initialization.

### Admin Redirect Path

```text
/api/auth/session → 404 → CLIENT_FETCH_ERROR → session = null (client)
→ Admin layout guard: server-side getServerSession MAY return null (if no valid cookie)
→ access.status = UNAUTHENTICATED → redirect('/auth/signin') or redirect('/')
```

## Prior Occurrence

This exact issue was fixed in Session 3 of the prior chain (RC1: `rm -rf .next`, RC2: remove module-level handler from auth.ts). The fix was NOT documented in AGENTS.md or IMPLEMENTATION_ANTI_PATTERNS.md, causing the AI to repeat the same diagnostic path in Session 5.

## Deferred Items

- **Migration "local cache"** — user raised concern that `pnpm db:pglite:migrate` tracks state differently from sequelize. Drizzle-kit uses `drizzle.__drizzle_migrations` table in the database (not a local file) alongside the committed `_journal.json` for migration ordering. This is expected behavior, not a bug. Needs separate task if user disagrees.
