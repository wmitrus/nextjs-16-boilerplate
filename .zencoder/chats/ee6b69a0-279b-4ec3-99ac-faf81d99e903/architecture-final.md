# Final Architecture Check — Phase 7: AuthJS Adapter

**Agent**: 01 - Architecture Guard
**Plan step**: Final Architecture Check
**Date**: 2026-04-21

---

## Circular Dependency Scan

```bash
pnpm skott:check:only
```

**Result**: ✅ No circular dependencies found (depth=Infinity)

---

## Module Boundary Review

### New authjs infrastructure (`src/modules/auth/infrastructure/authjs/`)

- `auth.config.ts` — depends on `@/core/env` only ✅ (Edge-safe)
- `auth.ts` — depends on `@/core/contracts`, `@/core/runtime/bootstrap`, `@/core/logger/di`, `@/modules/auth/infrastructure/drizzle/schema`, `@/modules/user/infrastructure/drizzle/schema`
  - Cross-module schema import from `user/` is acceptable (auth module owns identity; user module owns the user record — FK relationship requires this reference)
- `AuthJsEdgeIdentitySource.ts` — depends on `@/core/logger/di`, `@/core/env`, `auth.config.ts` ✅
- `AuthJsRequestIdentitySource.ts` — depends on `@/core/logger/di`, `auth.ts` ✅

### New authjs UI (`src/modules/auth/ui/authjs/`)

- `SessionProvider.tsx` — wraps `next-auth/react` ✅ (no business logic)
- `HeaderAuthControlsAuthjs.tsx` — client component using `next-auth/react` ✅
- `AuthJsWorkspaceSwitcher.tsx` — client component, calls `/api/auth/active-org` ✅

### Security middleware changes

- `route-policy.ts` — added authjs route prefixes — no boundary violations ✅
- `with-auth.ts` — added `getSignInPath()` reading `env.AUTH_PROVIDER` — contained change ✅

---

## Dependency Direction

All new dependencies flow in the correct direction:

- `app/` → `modules/auth/` → `core/` ✅
- `modules/auth/ui/` → `next-auth/react` (external) ✅
- No `core/` → `modules/` imports introduced ✅
- No `shared/` → `modules/` imports introduced ✅

---

## Provider Isolation

The authjs adapter is fully isolated behind:

- `AUTH_PROVIDER=authjs` environment variable gate
- `src/modules/auth/index.ts` factory function
- `src/proxy.ts` conditional wiring
- `src/app/layout.tsx` conditional `SessionProvider`

Switching to `AUTH_PROVIDER=clerk` removes all authjs code paths with zero code changes. ✅

---

## Verdict

✅ **Architecture integrity maintained**. No structural drift detected. Module boundaries respected. No circular dependencies. Provider isolation preserved.
