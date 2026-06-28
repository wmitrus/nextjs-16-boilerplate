# Validation Strategy — Phase 7: AuthJS Adapter

**Agent**: 05 - Validation Strategy
**Plan step**: Validation Strategy
**Date**: 2026-04-20

---

## Minimum Required Validation

### 1. TypeScript Typecheck

```bash
pnpm typecheck
```

Expected: 0 errors. Must run after all implementation steps.

### 2. Lint

```bash
pnpm lint --fix
```

Expected: 0 errors. Auto-fixes import order. Must run after all implementation steps.

### 3. Unit Tests

```bash
pnpm test
```

Expected: ≥1031 tests passing. Coverage threshold must remain ≥80%.

Key unit tests to write/update:

- `AuthJsRequestIdentitySource.test.ts` — replace stub tests with:
  - Returns identity data from Auth.js session
  - Returns empty data when unauthenticated (no session)
  - Caches the session result (single `auth()` call per instance)
  - Does not throw on unauthenticated (returns empty object)
- `AuthJsEdgeIdentitySource.test.ts` (new):
  - Extracts userId, email from Edge session
  - Returns empty when no session
  - Error path: returns empty (does not throw)

### 4. Build Check (optional but recommended)

```bash
pnpm build
```

Expected: No compile errors. Important because Turbopack may catch runtime issues that typecheck misses.

---

## Optional Additional Validation

### Integration Test — AuthJS Identity Source

If time permits, write an integration test that uses MSW to mock the Auth.js session and verifies the full identity resolution pipeline.

### Manual Smoke Test

After implementation:

1. Set `AUTH_PROVIDER=authjs` in `.env.local`
2. Start dev server: `pnpm dev`
3. Navigate to `/auth/signin` — verify custom sign-in page loads
4. Sign in with credentials — verify session created
5. Navigate to protected route — verify access granted
6. Sign out — verify session cleared
7. Navigate to protected route — verify redirect to `/auth/signin`
8. Set `AUTH_PROVIDER=clerk` — verify Clerk behavior restored

---

## Validation Not Required

- E2E Playwright tests for Phase 7 — manual smoke test is sufficient for this phase (per plan)
- Load/performance testing — not in scope
- OAuth provider testing — not in scope (credentials only)
- DB session adapter testing — JWT sessions only in Phase 7

---

## Validation Commands

```bash
# 1. Typecheck
pnpm typecheck

# 2. Lint (with auto-fix)
pnpm lint --fix

# 3. Unit tests
pnpm test

# 4. Verify test count (must be ≥ 1031)
pnpm test --reporter=verbose 2>&1 | tail -20
```

---

## Validation Gaps

- **Manual auth flow**: Automated E2E tests not written for Phase 7 (per plan scope). Manual smoke test is the acceptance gate.
- **OAuth providers**: Not tested (out of scope).
- **DB session adapter**: Not tested (JWT only in Phase 7).
- **Password reset flow**: Not implemented (out of scope).

---

## Acceptance Criteria

- [ ] `pnpm typecheck` → 0 errors
- [ ] `pnpm lint --fix` → 0 errors
- [ ] `pnpm test` → ≥1031 tests passing
- [ ] `AuthJsRequestIdentitySource.test.ts` tests real behavior (not stub)
- [ ] Manual: `/auth/signin` loads with `AUTH_PROVIDER=authjs`
- [ ] Manual: `AUTH_PROVIDER=clerk` still works after all changes
