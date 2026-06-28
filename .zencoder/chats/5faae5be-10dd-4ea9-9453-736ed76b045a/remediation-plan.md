# Remediation Plan

**Workflow**: Incident Investigation
**Date**: 2026-04-24
**Agent**: Debug Investigation (06)
**Status**: Completed — Fix Applied

---

## Root Causes

| #   | Root Cause                                                                                                                                             | Type                          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------- |
| RC1 | Turbopack filesystem cache preservation caused `[...nextauth]` catch-all route to not be registered in the current session's `app-paths-manifest.json` | Environment/Infrastructure    |
| RC2 | Dead module-level `NextAuth(authOptions)` call in `auth.ts` — stateful SDK init at import time, never imported by any consumer                         | Code Quality / Prerender Risk |

---

## Change Scope

### Fix for RC1 (Turbopack Cache)

**Action**: Manual — `rm -rf .next && pnpm dev`

**Files affected**: None (filesystem operation, not a code change)

**Expected behavior**: Turbopack rebuilds the route manifest from scratch, correctly registering `/api/auth/[...nextauth]`. `/api/auth/session` returns HTTP 200 JSON.

**Recurrence prevention**: Document that `rm -rf .next` is required when Turbopack routing anomalies occur in dev. This is a known Turbopack limitation with `turbopackFileSystemCacheForDev: true`.

### Fix for RC2 (Dead Module-Level Init)

**Action**: Code change — applied in previous session

**File**: `src/modules/auth/infrastructure/authjs/auth.ts`

**Lines removed**:

```typescript
import NextAuth from 'next-auth/next'; // removed (unused after fix)

const handler = NextAuth(authOptions); // removed (module-level side-effect)
export { handler }; // removed (never imported anywhere)
```

**`auth.ts` now exports only**: `authOptions: AuthOptions`

---

## Affected Files

| File                                             | Change Type                   | Status     |
| ------------------------------------------------ | ----------------------------- | ---------- |
| `src/modules/auth/infrastructure/authjs/auth.ts` | Removed dead exports + import | ✅ Applied |
| `.next/` (build cache)                           | Cleared manually              | ✅ Applied |

---

## Expected Behavior After Fix

1. `GET /api/auth/session` returns HTTP 200 with JSON session payload (or `{}` if unauthenticated)
2. `[next-auth][error][CLIENT_FETCH_ERROR]` no longer appears in browser console
3. `useSession()` hook returns valid session state
4. No prerender-time `Date.now()` errors from NextAuth module init

---

## Risks

| Risk                                                             | Mitigation                                                |
| ---------------------------------------------------------------- | --------------------------------------------------------- |
| Turbopack cache corruption can recur                             | `rm -rf .next` is the fix; document in dev workflow notes |
| `docs/features/32` route diagram may show stale `handler` export | Non-blocking; update as doc debt                          |

---

## Residual Risks

None blocking. The fix is a pure dead-code removal. The Turbopack cache issue is a dev-environment-only concern.
