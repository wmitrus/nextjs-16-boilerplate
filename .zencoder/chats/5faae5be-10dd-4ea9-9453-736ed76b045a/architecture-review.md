# Architecture Impact Review

**Workflow**: Incident Investigation
**Date**: 2026-04-24
**Agent**: Architecture Guard (01)
**Status**: Completed

---

## Objective

Verify that removing `const handler = NextAuth(authOptions)` from `auth.ts` does not violate module boundaries, DI discipline, or introduce regressions.

---

## Current-State Findings

### Change Applied

**File**: `src/modules/auth/infrastructure/authjs/auth.ts`

**Removed**:

```typescript
import NextAuth from 'next-auth/next';

const handler = NextAuth(authOptions); // module-level side-effect
export { handler }; // never imported anywhere
```

**Retained**:

```typescript
export const authOptions: AuthOptions = { ... };
```

### Module Boundary Analysis

| Check                                                                                  | Finding                                                |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `auth.ts` belongs to `src/modules/auth/infrastructure/authjs/`                         | ✅ Correct placement                                   |
| `authOptions` is an infrastructure export used by the route handler                    | ✅ Correct                                             |
| `handler` was never imported by any consumer                                           | ✅ Confirmed via grep                                  |
| Route handler `src/app/api/auth/[...nextauth]/route.ts` imports `authOptions` directly | ✅ Correct consumer pattern                            |
| `NextAuth()` call now lives only in the route handler (request-time)                   | ✅ Correct — SDK call at request time, not module init |

### Dependency Direction

```
src/app/api/auth/[...nextauth]/route.ts
  → src/modules/auth/infrastructure/authjs/auth.ts (authOptions)
  → next-auth/next (NextAuth)
```

Direction is correct: `app` → `modules/auth/infrastructure`. No inversion.

### DI Discipline

The `authOptions` export is a plain object (configuration), not a DI-managed service. This is appropriate — it is a static provider configuration, not a request-scoped or container-managed dependency.

The route handler calls `NextAuth(req, ctx, authOptions)` at request time. This is the correct pattern:

- DI container initialized via `getAppContainer()` in `src/core/runtime/bootstrap.ts`
- Session handling via NextAuth is request-scoped (called inside the `handler()` function)
- No global state mutation

### Security Boundaries

- Auth boundary: `src/modules/auth/infrastructure/authjs/` owns NextAuth configuration
- Delivery boundary: `src/app/api/auth/[...nextauth]/route.ts` owns the HTTP endpoint
- Security middleware: `src/proxy.ts` passes `/api/auth/*` through without interference
- No auth logic leaked into shared or UI layers
- No session handling code moved to client-side

### Rate Limiting

The route handler wraps credentials sign-in with rate limiting via `checkRateLimit()`. This is at request time in `handler()` — unaffected by the change.

---

## Docs vs Code Drift

| Doc                                                 | Status                                                                                                                                   |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/features/32 - AuthJS Custom Auth Provider.md` | Minor drift risk — may reference the `handler` export in a route diagram. Not verified. Low priority — does not affect runtime behavior. |

---

## Architectural Assessment

The removal of `const handler = NextAuth(authOptions)` is:

1. **Correct** — the handler was dead code; the export was never consumed
2. **Safe** — no consumer relied on it; removing it cannot break any downstream
3. **Necessary** — module-level stateful SDK initialization is a violation of Next.js 16 prerender discipline
4. **Low blast radius** — single file, dead code removal, no dependency changes

The fix is architecturally sound. It follows the existing pattern:

- Configuration (authOptions) lives in the infrastructure module
- SDK instantiation (NextAuth) happens at request time in the delivery layer

---

## Risks

| Risk                            | Severity      | Notes                                            |
| ------------------------------- | ------------- | ------------------------------------------------ |
| None identified                 | —             | Pure dead code removal                           |
| Doc drift in `docs/features/32` | Informational | Minor diagram update may be needed; not blocking |

---

## Recommended Next Action

No architectural follow-up required. Proceed to Validation Strategy.

Optional doc cleanup: Update `docs/features/32 - AuthJS Custom Auth Provider.md` route diagram if it references the `handler` export. This is non-blocking.
