# Full SDD workflow

## Workflow Steps

### [x] Step: Requirements

Created: `.zencoder/chats/b73a45d2-3625-4c95-8ff9-859f23916a2d/requirements.md`

### [x] Step: Technical Specification

Created: `.zencoder/chats/b73a45d2-3625-4c95-8ff9-859f23916a2d/spec.md`

### [x] Step: Planning

Tasks defined below.

---

## Implementation Phases

### Phase 1 — Decouple Clerk from domain (RequestIdentitySource)

> **Ask for confirmation before starting this phase.**

- [x] 1.1 Add `RequestIdentitySource` + `RequestIdentitySourceData` interfaces to `src/core/contracts/identity.ts`
- [x] 1.2 Add `AUTH.IDENTITY_SOURCE` symbol to `src/core/contracts/index.ts`
- [x] 1.3 Create `src/modules/auth/infrastructure/ClerkRequestIdentitySource.ts` + test
- [x] 1.4 Create `src/modules/auth/infrastructure/RequestScopedIdentityProvider.ts` + test
- [x] 1.5 Create `src/modules/auth/infrastructure/RequestScopedTenantResolver.ts` + test
- [x] 1.6 Update `src/modules/auth/index.ts` to wire new classes
- [x] 1.7 Update `src/proxy.ts`: build request-scoped `RequestIdentitySource` from `auth` callback, override container registrations; remove old `resolveIdentity`/`resolveTenant` closures
- [x] 1.8 Delete `ClerkIdentityProvider.ts` + `.test.ts`, `ClerkTenantResolver.ts` + `.test.ts`
- [x] 1.9 Verify: `pnpm typecheck` + `pnpm lint` pass

### Phase 2 — Simplify SecurityContext (remove role computation)

> **Ask for confirmation before starting this phase.**

- [x] 2.1 Remove `role: UserRole` from `SecurityContext.user` in `src/security/core/security-context.ts`
- [x] 2.2 Remove `roleRepository` + all role computation from `createSecurityContext`
- [x] 2.3 Remove `roleRepository` from `SecurityContextDependencies` and `SecurityDependencies` in `src/security/core/security-dependencies.ts`
- [x] 2.4 Update `src/security/actions/action-audit.ts`: remove `role` from log payload
- [x] 2.5 Update `src/security/actions/secure-action.ts`: remove `authorization.ensureRequiredRole(...)` call; remove `role: context.user.role` from subject attributes
- [x] 2.6 Update `src/features/security-showcase/actions/showcase-actions.ts`: remove `roleRepository` from SecurityContextDependencies
- [x] 2.7 Update `src/features/security-showcase/components/AdminOnlyExample.tsx`: remove `role` from display
- [x] 2.8 Update `src/features/security-showcase/components/ProfileExample.tsx`: remove `role` from display
- [x] 2.9 Update `src/proxy.ts`: remove `roleRepository` from `securityDependencies`
- [x] 2.10 Update `src/security/core/security-context.test.ts`: remove `roleRepository` references and `role` assertions
- [x] 2.11 Update `src/security/core/security-context.mock.ts` if `role` is present
- [x] 2.12 Update `src/testing/factories/security.ts` if `role` is present
- [x] 2.13 Verify: `pnpm typecheck` + `pnpm lint` pass

### Phase 3 — AuthorizationService internalizes role resolution

> **Ask for confirmation before starting this phase.**

- [x] 3.1 Add `RoleRepository` parameter to `DefaultAuthorizationService` constructor
- [x] 3.2 Call `roleRepository.getRoles()` inside `can()` and merge roles into `subject.roles` on enriched context
- [x] 3.3 Update `src/modules/authorization/index.ts`: inject `roleRepository` into `DefaultAuthorizationService`
- [x] 3.4 Update `src/testing/integration/authorization.integration.test.ts`: add `MockRoleRepository` to `DefaultAuthorizationService` instantiation
- [x] 3.5 Update `src/testing/integration/server-actions.test.ts`: remove `roleRepository` from `SecurityContextDependencies` wiring; remove `vi.mocked(roleRepository.getRoles)` calls
- [x] 3.6 Verify: `pnpm typecheck` + `pnpm lint` pass

### Phase 4 — Authorization infrastructure separation (mock vs memory)

> **Ask for confirmation before starting this phase.**

- [x] 4.1 Create `src/modules/authorization/infrastructure/memory/InMemoryRepositories.ts` with `InMemoryRoleRepository`, `InMemoryPolicyRepository`, `InMemoryMembershipRepository`, `InMemoryTenantAttributesRepository`
- [x] 4.2 Update `src/modules/authorization/index.ts`: env-conditional registration (`NODE_ENV === 'test'` → mock, otherwise → in-memory)
- [x] 4.3 Keep `MockRepositories.ts` intact (used in integration tests)
- [x] 4.4 Update `MembershipRepository` interface to `isMember(subjectId, tenantId)` — cleaner contract, avoids fetching full membership list
- [x] 4.5 Verify: `pnpm typecheck` + `pnpm lint` pass

### Phase 5 — Architectural hardening (post-audit fixes)

- [x] 5.1 Production guard: throw in `authorizationModule` if `NODE_ENV === 'production'` — prevents accidental permissive-InMemory deployment
- [x] 5.2 Fix `RequestScopedTenantResolver`: replace `orgId ?? 'default'` with `orgId ?? identity.id` (personal workspace pattern — multi-tenant safe)
- [x] 5.3 Remove `PERMISSION_REPOSITORY` from `src/core/contracts/index.ts`, `src/core/contracts/repositories.ts`, `src/modules/authorization/index.ts`, `tests/setup.tsx`
- [x] 5.4 Verify: `pnpm typecheck` + `pnpm lint` + full test suite pass — 65 unit (360) + 12 integration (60) all pass

### Final Verification

- [x] Run `pnpm typecheck` — zero errors
- [x] Run `pnpm lint` — zero warnings/errors
- [x] Run full test suite — 65 unit files (360 tests) + 12 integration files (60 tests) — all pass

### Docs Update

- [x] Update `docs/features/22 - RBAC Baseline.md` — reflects current post-Phase 5 architecture
- [x] Update `docs/features/23 - ABAC Foundation.md` — reflects current post-Phase 5 architecture
