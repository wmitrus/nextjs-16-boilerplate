# PRD: RBAC Baseline Hardening (Prompt 00)

## Architecture Understanding Statement

This codebase implements a strict Modular Monolith where:

- `auth` module owns authentication provider adapters (Clerk → `Identity`, `TenantContext`)
- `authorization` module owns RBAC/policy domain logic (`AuthorizationService`, `PolicyEngine`, repositories)
- `security/*` layer enforces policy centrally via `AuthorizationFacade`, `createSecurityContext`, `withAuth`, `createSecureAction`
- `core/contracts/*` is the sole inter-module communication surface
- Dependency direction: `security → core/shared`, `modules → core/shared`, composition root in `core/container`

The RBAC baseline **partially exists** but has gaps in test coverage and two minor normalization issues.

---

## Current RBAC Flow (As-Is)

### Role Acquisition Path

```
ClerkIdentityProvider.getCurrentIdentity()
  → Identity { id, email }
  → ClerkTenantResolver.resolve(identity)
  → TenantContext { tenantId, userId }
  → RoleRepository.getRoles(identity.id, tenant.tenantId)
  → RoleId[] (e.g. ['admin'] | ['user'])
  → SecurityContext.user.role: UserRole ('admin' | 'user' | 'guest')
```

**Layer**: `security/core/security-context.ts` assembles this via injected `SecurityContextDependencies`.

**Critical observation**: `RoleRepository` is provided by the `authorization` module (currently `MockRoleRepository`). Security context consumes it via the DI container through contracts. ✅ Contract-driven.

### Auth ↔ Authorization Coupling Map

| Source                                              | Contract                                                   | Consumer                                                                |
| --------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------- |
| `modules/auth` ClerkIdentityProvider                | `core/contracts/identity.ts` → `IdentityProvider`          | `security/core/security-context.ts`, `security/middleware/with-auth.ts` |
| `modules/auth` ClerkTenantResolver                  | `core/contracts/tenancy.ts` → `TenantResolver`             | `security/core/security-context.ts`, `security/middleware/with-auth.ts` |
| `modules/authorization` MockRoleRepository          | `core/contracts/repositories.ts` → `RoleRepository`        | `security/core/security-context.ts`                                     |
| `modules/authorization` DefaultAuthorizationService | `core/contracts/authorization.ts` → `AuthorizationService` | `security/core/authorization-facade.ts`                                 |

**Coupling**: contract-driven exclusively. No direct cross-module imports. ✅ Clean.

### Enforcement Paths

#### 1. Middleware (`with-auth.ts`)

```
request → withAuth
  → identityProvider.getCurrentIdentity() → userId
  → userRepository.findById(userId) → onboarding check
  → [if authenticated && private route]:
      tenantResolver.resolve(identity) → tenant
      authorization.authorize({ tenant, subject, resource: 'route', action: 'route:access' })
        → DefaultAuthorizationService.can()
          → membershipRepository.getTenantMemberships(userId) → check tenant membership
          → policyRepository.getPolicies(context) → policies
          → PolicyEngine.evaluate(context, policies)
```

**Gap**: No role floor check (e.g., require 'admin') in middleware. Only policy-based check. This is **by design** (routes don't have role floors), but needs to be explicit.

#### 2. Secure Actions (`secure-action.ts`)

```
createSecureAction({ role: 'admin', ... })
  → getSecurityContext() → SecurityContext (includes user.role from RoleRepository)
  → new AuthorizationFacade(authorizationService)
  → authorization.ensureRequiredRole(context.user.role, requiredRole) [RBAC floor]
  → authorization.authorize({ tenant, subject, resource, action }) [policy check]
```

**Note**: Dual enforcement (RBAC floor + policy). This is the correct and consistent pattern.

---

## Gaps Identified

### Gap 1: Missing RBAC floor in middleware (normalization needed)

`with-auth.ts` does not call `ensureRequiredRole`. This is **architecturally correct** for route-level access (routes are policy-controlled, not role-floored). However, the architecture does not make this explicit.

**Decision**: The route access check is policy-driven only. The role floor is only needed in `secure-action.ts` where per-action role requirements are configured. This is intentional and correct. **No change needed** — only documentation/test clarity.

### Gap 2: MockRoleRepository coupling in authorization module registered globally

The `authorization` module registers `MockRoleRepository` globally. `security-context.ts` depends on `RoleRepository` from the DI container. This means the security context RBAC path always uses the mock.

**Decision**: For this baseline prompt, the mock stays (real DB integration is outside scope). The contract is correct. Tests must validate the mock's behavior is consistent.

### Gap 3: Missing test coverage for RBAC scenarios

Currently missing or insufficient tests for:

- Unauthenticated deny in `secure-action` → ✅ exists in `server-actions.test.ts`
- Role floor: user requires admin → ✅ exists in `server-actions.test.ts`
- Role floor: guest → unauthenticated → ✅ exists implicitly
- Stable auth + authorization handoff with correct tenant → ❌ missing explicit test
- Tenant mismatch (wrong tenant membership) → ❌ missing
- Admin role allows access; user role denies admin-only action → ✅ exists
- `security-context.ts` role mapping: multiple roles, unknown role → ❌ missing

### Gap 4: `security-context.ts` role resolution — no 'guest' assignment

Current code assigns `'user'` as default when roles array doesn't include 'admin'. It never assigns 'guest'. The `UserRole` type includes 'guest' but it's never set. This means unauthenticated users get `user: undefined` (not a user with role 'guest').

**Decision**: This is correct behavior — 'guest' should be the conceptual state when `context.user === undefined`. No schema change needed, but tests should validate this explicitly.

### Gap 5: MockMembershipRepository uses fragile `user_` prefix pattern

`MockMembershipRepository` returns memberships only for `subjectId.startsWith('user_')`. Users with IDs not starting with 'user\_' only get `['t1']` tenancy. This is an implicit convention.

**Decision**: Document and test this explicitly so it's clear this is the mock's contract.

---

## Objective

Establish a verified RBAC baseline where:

1. The role acquisition path (`identity → tenant → roles → security context`) is explicitly tested.
2. The auth-to-authorization handoff (middleware and secure actions) is validated with integration tests.
3. Role enforcement is deterministic and consistent.
4. No boundary violations exist.
5. All quality gates pass.

---

## Acceptance Criteria

- [ ] RBAC flow is covered by unit/integration tests at all key points.
- [ ] Tenant + role combination edge cases are tested.
- [ ] Security context role mapping is explicit.
- [ ] All gates pass: `typecheck`, `skott`, `madge`, `depcheck`, `env:check`, `test`.
- [ ] Forbidden import scan is clean (composition-root exception documented).
- [ ] No new boundary violations introduced.

---

## Scope Boundaries

**In scope**:

- Tests for RBAC flow at `security-context.ts`, `authorization.integration.test.ts`, `with-auth.test.ts`, `server-actions.test.ts`
- Possible normalization of mock behavior to make edge cases explicit
- Any minor code fixes discovered during testing

**Out of scope**:

- Real database implementation (Drizzle schema) — Prompt 03+ territory
- ABAC extensions — Prompt 01 territory
- Multi-tenant hardening — Prompt 02 territory
- New contracts or DI tokens beyond what already exists
