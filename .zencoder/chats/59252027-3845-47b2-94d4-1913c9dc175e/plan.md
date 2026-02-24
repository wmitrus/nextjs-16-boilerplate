# Full SDD workflow

## Workflow Steps

### [x] Step: Requirements

Create a Product Requirements Document (PRD) based on the feature description.

1. Review existing codebase to understand current architecture and patterns
2. Analyze the feature definition and identify unclear aspects
3. Ask the user for clarifications on aspects that significantly impact scope or user experience
4. Make reasonable decisions for minor details based on context and conventions
5. If user can't clarify, make a decision, state the assumption, and continue

Save the PRD to `/home/ozi/projects/nextjs-16-boilerplate/.zencoder/chats/59252027-3845-47b2-94d4-1913c9dc175e/requirements.md`.

### [x] Step: Technical Specification

Create a technical specification based on the PRD in `/home/ozi/projects/nextjs-16-boilerplate/.zencoder/chats/59252027-3845-47b2-94d4-1913c9dc175e/requirements.md`.

1. Review existing codebase architecture and identify reusable components
2. Define the implementation approach

Save to `/home/ozi/projects/nextjs-16-boilerplate/.zencoder/chats/59252027-3845-47b2-94d4-1913c9dc175e/spec.md` with:

- Technical context (language, dependencies)
- Implementation approach referencing existing code patterns
- Source code structure changes
- Data model / API / interface changes
- Delivery phases (incremental, testable milestones)
- Verification approach using project lint/test commands

### [x] Step: Planning

Create a detailed implementation plan based on `/home/ozi/projects/nextjs-16-boilerplate/.zencoder/chats/59252027-3845-47b2-94d4-1913c9dc175e/spec.md`.

1. Break down the work into concrete tasks
2. Each task should reference relevant contracts and include verification steps
3. Replace the Implementation step below with the planned tasks

Rule of thumb for step size: each step should represent a coherent unit of work (e.g., implement a component, add an API endpoint, write tests for a module). Avoid steps that are too granular (single function) or too broad (entire feature).

If the feature is trivial and doesn't warrant full specification, update this workflow to remove unnecessary steps and explain the reasoning to the user.

Save to `/home/ozi/projects/nextjs-16-boilerplate/.zencoder/chats/59252027-3845-47b2-94d4-1913c9dc175e/plan.md`.

### [x] Step: Implementation

#### Phase 1: Foundation (Core & Contracts)

- [x] **1.1 Identity Contracts**: Create `src/core/contracts/identity.ts` (`Identity`, `IdentityProvider`)
  - _Verification_: `pnpm typecheck`, `pnpm lint`
- [x] **1.2 Tenancy Contracts**: Create `src/core/contracts/tenancy.ts` (`TenantContext`, `TenantResolver`)
  - _Verification_: `pnpm typecheck`, `pnpm lint`
- [x] **1.3 Authorization Contracts**: Create `src/core/contracts/authorization.ts` (`SubjectContext`, `ResourceContext`, `AuthorizationContext`, `AuthorizationService`)
  - _Verification_: `pnpm typecheck`, `pnpm lint`
- [x] **1.4 Repository Contracts**: Create `src/core/contracts/repositories.ts` (`RoleRepository`, `PermissionRepository`, `MembershipRepository`, `PolicyRepository`)
  - _Verification_: `pnpm typecheck`, `pnpm lint`
- [x] **1.5 DI Container**: Create `src/core/container/index.ts` with base `Container` class and `registerModule` support
  - _Verification_: Unit test for container registration

#### Phase 2: Auth Infrastructure (Clerk)

- [x] **2.1 Clerk Identity**: Implement `ClerkIdentityProvider` in `src/modules/auth/infrastructure/ClerkIdentityProvider.ts`
  - _Verification_: `pnpm typecheck`, `pnpm lint`
- [x] **2.2 Clerk Tenancy**: Implement `ClerkTenantResolver` in `src/modules/auth/infrastructure/ClerkTenantResolver.ts`
  - _Verification_: `pnpm typecheck`, `pnpm lint`
- [x] **2.3 Auth Module Registration**: Create `src/modules/auth/index.ts` with `registerModule` function
  - _Verification_: Verify it registers to container without leakage
- [x] **2.4 Infrastructure Tests**: Unit tests for Clerk infrastructure adapters (mocking Clerk SDK)

#### Phase 3: Authorization Domain & Policy Engine

- [x] **3.1 Policy Engine**: Implement `PolicyEngine` in `src/modules/authorization/domain/policy/PolicyEngine.ts` (deny-overrides, ABAC support)
  - _Verification_: Unit tests for various policy scenarios (allow, deny, conditions)
- [x] **3.2 Authorization Service**: Implement `DefaultAuthorizationService` in `src/modules/authorization/domain/AuthorizationService.ts`
  - _Verification_: `pnpm typecheck`, `pnpm lint`
- [x] **3.3 Authz Module Registration**: Create `src/modules/authorization/index.ts` with `registerModule` function
- [x] **3.4 Domain Tests**: Unit tests for Policy Engine (mocking repositories)

#### Phase 4: Repositories & Wiring

- [x] **4.1 Mock Repositories**: Implement `MockRoleRepository` and `MockPolicyRepository` in `src/modules/authorization/infrastructure/`
- [x] **4.2 Global Wiring**: Wire all modules in `src/core/container/index.ts` (bootstrap process)
  - _Verification_: Integration test ensuring container resolves services correctly

#### Phase 5: Framework Refactoring

- [/] **5.1 Security Context**: Refactor `src/security/core/security-context.ts` to use `IdentityProvider` and `TenantResolver` from Container
- [ ] **5.2 Proxy Refactoring**: Refactor `src/proxy.ts` to replace direct Clerk usage with Container-managed services
- [ ] **5.3 Secure Action Refactoring**: Refactor `src/security/actions/secure-action.ts` to use `AuthorizationService`
- [ ] **5.4 Onboarding Migration**: Refactor `src/actions/onboarding.ts` into `src/modules/user/application/CompleteOnboardingUseCase.ts`

#### Phase 6: Final Verification

- [ ] **6.1 Quality Suite**: `pnpm lint` and `pnpm typecheck`
- [ ] **6.2 Test Suite**: `pnpm test` (all unit and integration tests)
- [ ] **6.3 Dependency Audit**: `pnpm skott:check:only` for module isolation audit
- [ ] **6.4 Clerk Audit**: `grep` audit for forbidden `@clerk/nextjs` imports in Domain/Authorization layers
