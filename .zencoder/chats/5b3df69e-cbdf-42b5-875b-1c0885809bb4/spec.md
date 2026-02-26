# Technical Specification: RBAC Baseline Hardening (Prompt 00)

## Technical Context

- **Language**: TypeScript ^5, strict mode
- **Runtime**: Next.js 16, Node.js ^20
- **Test framework**: Vitest
- **DI**: Custom container in `src/core/container/index.ts`
- **Auth**: Clerk (isolated in adapter, no SDK leakage to domain)
- **No new dependencies** required for this prompt

---

## Architecture Fit

All changes remain within:

- `src/modules/authorization/` — mock repository improvements
- `src/security/core/security-context.test.ts` — new test cases
- `src/testing/integration/authorization.integration.test.ts` — new test cases
- `src/security/middleware/with-auth.test.ts` — new test cases
- `src/security/core/security-context.ts` — possible minor normalization

**No new contracts, tokens, or modules required.**

---

## Current State Analysis

### What exists and is correct

| Component                       | File                                                       | Status                                     |
| ------------------------------- | ---------------------------------------------------------- | ------------------------------------------ |
| `IdentityProvider` contract     | `core/contracts/identity.ts`                               | ✅ Clean                                   |
| `TenantResolver` contract       | `core/contracts/tenancy.ts`                                | ✅ Clean                                   |
| `RoleRepository` contract       | `core/contracts/repositories.ts`                           | ✅ Clean                                   |
| `AuthorizationService` contract | `core/contracts/authorization.ts`                          | ✅ Clean                                   |
| `ClerkIdentityProvider`         | `modules/auth/infrastructure/ClerkIdentityProvider.ts`     | ✅ Clean                                   |
| `ClerkTenantResolver`           | `modules/auth/infrastructure/ClerkTenantResolver.ts`       | ✅ Clean                                   |
| `MockRoleRepository`            | `modules/authorization/infrastructure/MockRepositories.ts` | ✅ Functional, needs documented edge cases |
| `DefaultAuthorizationService`   | `modules/authorization/domain/AuthorizationService.ts`     | ✅ Clean                                   |
| `PolicyEngine`                  | `modules/authorization/domain/policy/PolicyEngine.ts`      | ✅ Clean, well-tested                      |
| `createSecurityContext`         | `security/core/security-context.ts`                        | ✅ Clean, needs more tests                 |
| `AuthorizationFacade`           | `security/core/authorization-facade.ts`                    | ✅ Clean, needs more tests                 |
| `withAuth` middleware           | `security/middleware/with-auth.ts`                         | ✅ Functional, needs more tests            |
| `createSecureAction`            | `security/actions/secure-action.ts`                        | ✅ Clean                                   |

### What needs normalization/addition

#### 1. `security-context.ts` — 'guest' role is dead code

The `UserRole` type has `'guest'` but it's never assigned. When unauthenticated, `context.user` is `undefined`. The `'guest'` role only appears in `ensureRequiredRole` comparison (which never triggers on guest since `!context.user` throws first).

**Fix**: Either remove `'guest'` from `UserRole` and keep it as a conceptual state represented by `user === undefined`, OR document explicitly that `'guest'` means unauthenticated in certain downstream checks.

**Decision**: Keep `'guest'` in the type but document the semantic clearly. `secure-action.ts` uses `role?: UserRole` with default `'user'`. The `ensureRequiredRole` only uses `'admin'` check currently:

```ts
if (requiredRole === 'admin' && currentRole !== 'admin') {
  throw new AuthorizationError(`Required role: ${requiredRole}`);
}
```

This means `role: 'user'` and `role: 'guest'` both pass when `requiredRole === 'user'`. The check should be hierarchical: `admin > user > guest`.

**Normalization**: Add proper role hierarchy check to `ensureRequiredRole` to make RBAC floor deterministic.

#### 2. `MockRoleRepository` — inconsistent with security context usage

`security-context.ts` calls `roleRepository.getRoles(identity.id, tenantContext.tenantId)` and checks if `roles.includes('admin')`. This is the **canonical RBAC path**.

`MockRoleRepository.getRoles` uses `subjectId.startsWith('user_admin')` pattern to return `['admin']`. This is the implicit contract for tests. This works but needs explicit test coverage.

#### 3. `authorization-facade.ts` `ensureRequiredRole` — incomplete role hierarchy

Current logic:

```ts
if (requiredRole === 'admin' && currentRole !== 'admin') {
  throw new AuthorizationError(...)
}
```

This allows `requiredRole: 'user'` to pass for ANY current role (including `'guest'`). The correct hierarchy is: `admin > user > guest`. A guest trying to access a user-required action should be denied.

**Fix**: Normalize to explicit role hierarchy:

```ts
const ROLE_HIERARCHY: Record<UserRole, number> = {
  guest: 0,
  user: 1,
  admin: 2,
};

if (ROLE_HIERARCHY[currentRole] < ROLE_HIERARCHY[requiredRole]) {
  throw new AuthorizationError(`Required role: ${requiredRole}`);
}
```

**Impact**: This could break existing tests that set `role: 'user'` with currentRole `'guest'`. Need to audit.

Actually, since `'guest'` is never set (user is undefined triggers earlier throw), this normalization is safe. But we should still add it for correctness.

---

## Implementation Approach

### Phase 1: Normalize `ensureRequiredRole` to full role hierarchy

**File**: `src/security/core/authorization-facade.ts`

Add `ROLE_HIERARCHY` constant and update `ensureRequiredRole` to compare hierarchy numerically. This makes RBAC floor deterministic for all role levels.

### Phase 2: Add missing tests to `security-context.test.ts`

New test cases:

- Multiple roles returned, admin wins
- Unknown/unrecognized role → defaults to 'user'
- Empty roles array → defaults to 'user'

### Phase 3: Expand `authorization.integration.test.ts`

New test cases:

- Tenant mismatch → deny
- User with correct tenant membership → allow
- Membership lookup is contract-driven (mock verifies signature)

### Phase 4: Expand `with-auth.test.ts`

New test cases:

- Authenticated user, authorization returns false → 403 for API, redirect for page
- Unauthenticated user, private API route → 401 JSON
- Ensure `authorization.authorize()` is called with correct tenant+subject structure

### Phase 5: Expand `server-actions.test.ts`

New test cases:

- guest/unauthenticated trying user-required action → unauthorized
- user trying admin-required action → unauthorized
- admin can access admin-required action
- Tenant + role combination (user in wrong tenant → denied by membership check)

---

## Source Code Structure Changes

| File                                                        | Change Type  | Reason                                          |
| ----------------------------------------------------------- | ------------ | ----------------------------------------------- |
| `src/security/core/authorization-facade.ts`                 | Normalize    | Add role hierarchy for deterministic RBAC floor |
| `src/security/core/security-context.test.ts`                | Expand tests | Cover role mapping edge cases                   |
| `src/testing/integration/authorization.integration.test.ts` | Expand tests | Tenant mismatch, membership edge cases          |
| `src/security/middleware/with-auth.test.ts`                 | Expand tests | Authorization denial paths                      |
| `src/testing/integration/server-actions.test.ts`            | Expand tests | Role hierarchy, tenant+role combinations        |

---

## Data Model / API / Interface Changes

### `authorization-facade.ts` — `ensureRequiredRole` normalization

**Before**:

```ts
ensureRequiredRole(currentRole: UserRole | undefined, requiredRole: UserRole) {
  if (!currentRole) {
    throw new AuthorizationError('Authentication required');
  }
  if (requiredRole === 'admin' && currentRole !== 'admin') {
    throw new AuthorizationError(`Required role: ${requiredRole}`);
  }
}
```

**After**:

```ts
private static readonly ROLE_HIERARCHY: Record<UserRole, number> = {
  guest: 0,
  user: 1,
  admin: 2,
};

ensureRequiredRole(currentRole: UserRole | undefined, requiredRole: UserRole) {
  if (!currentRole) {
    throw new AuthorizationError('Authentication required');
  }
  const currentLevel = AuthorizationFacade.ROLE_HIERARCHY[currentRole] ?? 0;
  const requiredLevel = AuthorizationFacade.ROLE_HIERARCHY[requiredRole] ?? 0;
  if (currentLevel < requiredLevel) {
    throw new AuthorizationError(`Required role: ${requiredRole}`);
  }
}
```

**Backward compatibility**: Existing tests pass because:

- `currentRole='admin'` + `requiredRole='admin'` → 2 >= 2 → passes ✅
- `currentRole='user'` + `requiredRole='user'` → 1 >= 1 → passes ✅
- `currentRole='user'` + `requiredRole='admin'` → 1 < 2 → throws ✅ (same as before)
- `currentRole=undefined` → throws 'Authentication required' ✅ (same as before)

---

## Delivery Phases

### Phase 1 — Normalize authorization facade role check (small code change)

- Files: `authorization-facade.ts`
- Verification: Existing tests must still pass; run `pnpm test src/security`

### Phase 2 — Security context role tests

- Files: `security-context.test.ts`
- Verification: New tests pass

### Phase 3 — Authorization integration tests (tenant + role edge cases)

- Files: `authorization.integration.test.ts`
- Verification: New tests pass

### Phase 4 — Middleware RBAC tests

- Files: `with-auth.test.ts`
- Verification: New tests pass

### Phase 5 — Server actions RBAC tests

- Files: `server-actions.test.ts`
- Verification: New tests pass

### Phase 6 — Full gate verification

- Run all gates; record results

---

## Verification Approach

```bash
pnpm typecheck
pnpm skott:check:only
pnpm madge
pnpm depcheck
pnpm env:check
pnpm test
```

Forbidden import scans (expected: only composition-root exception in `core/container/index.ts`):

```bash
grep -RInE "from ['\"]@/(modules|security|features|app)/" src/shared || true
grep -RInE "from ['\"]@/(app|features|security)/" src/modules || true
grep -RInE "from ['\"]@/(app|features|modules)/" src/security || true
grep -RInE "from ['\"]@/(modules|security|features|app)/" src/core || true
```
