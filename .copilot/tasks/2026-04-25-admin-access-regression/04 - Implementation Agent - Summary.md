# 04 — Implementation Agent Summary

**Task**: Admin Access Regression — Fix + Tests  
**Date**: 2026-04-25  
**Status**: Complete

## Changes Implemented

### 1. Immediate Fix: Force Turbopack Cache Recompile

```bash
touch src/app/api/auth/[...nextauth]/route.ts
```

Forces Turbopack to recompile the `[...nextauth]` route with the current `auth.ts` (which does not have the module-level `NextAuth()` call). Verified: `/api/auth/session` returns `200 {}`.

### 2. `src/modules/auth/infrastructure/authjs/auth.ts` (uncommitted working tree)

The working tree already has the RC2 fix from Session 3: `import NextAuth from 'next-auth/next'` and `const handler = NextAuth(authOptions)` and `export { handler }` have been removed. The file exports only `authOptions`.

**Action required**: `git add src/modules/auth/infrastructure/authjs/auth.ts && git commit`.

### 3. Unit Regression Guard (`src/modules/auth/infrastructure/authjs/auth.test.ts`)

Added inside the `describe('authOptions', ...)` block:

```typescript
describe('module-level exports safety (App Router regression guard)', () => {
  it('exports authOptions but NOT a module-level handler, GET, or POST', async () => {
    vi.resetModules();
    const mod = await import('./auth');
    expect(mod.authOptions).toBeDefined();
    const safetyCheck = mod as Record<string, unknown>;
    expect(safetyCheck['handler']).toBeUndefined();
    expect(safetyCheck['GET']).toBeUndefined();
    expect(safetyCheck['POST']).toBeUndefined();
  });
});
```

### 4. `src/app/admin/layout.tsx` (from Session 5)

AdminLayoutGuard: provisioning error catch block changed from `redirect('/')` to `throw err` — DB/infrastructure errors now surface to error boundary instead of silently masking as access-denied.

### 5. `e2e/authjs-auth.ts` (new file)

AuthJS E2E sign-in helper. Uses `E2E_AUTHJS_USER_EMAIL` / `E2E_AUTHJS_USER_PASSWORD` from env. Avoids `process.env[dynamicKey]` (SEC-18 compliance).

### 6. `e2e/authjs-session.spec.ts` (new file)

Three tests guarding the session endpoint health. Skips unless `AUTH_PROVIDER=authjs`.

### 7. `e2e/admin.spec.ts` and `e2e/admin-users.spec.ts` (rewritten)

Replaced Clerk imports with `authjs-auth.ts` helpers. Authenticated tests now properly gate on `isAuthjsRuntime() && hasAuthjsE2ECredentials()`.

### 8. Anti-Pattern Documentation

- `docs/ai/general/IMPLEMENTATION_ANTI_PATTERNS.md` — new section **2.4 Module-Level Framework Initialization In Shared Auth Modules** with recovery procedure and regression guards
- `AGENTS.md` — new section **"AuthJS — Module-Level NextAuth Call Banned In Shared Modules"** before Rate Limiting section

### 9. `.env.example`

Added `E2E_AUTHJS_USER_EMAIL` and `E2E_AUTHJS_USER_PASSWORD` with comments.

## Validation

| Check                      | Result                         |
| -------------------------- | ------------------------------ |
| `pnpm typecheck`           | ✅ Pass                        |
| `pnpm lint --fix`          | ✅ Pass (0 errors, 0 warnings) |
| `pnpm test`                | ✅ 1136 tests pass (159 files) |
| `/api/auth/session` curl   | ✅ 200 `{}`                    |
| `/api/auth/providers` curl | ✅ 404 → 200 (after touch)     |

## Remaining User Actions

1. `git add -p` and commit `auth.ts` working tree changes
2. Set `E2E_AUTHJS_USER_EMAIL` and `E2E_AUTHJS_USER_PASSWORD` in `.env.local` to run authenticated E2E
3. Run `pnpm e2e` with the dev server running to verify session and admin E2E specs pass
