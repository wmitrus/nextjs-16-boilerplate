# Full SDD workflow

## Workflow Steps

### [x] Step: Requirements

Create a Product Requirements Document (PRD) based on the feature description.

1. Review existing codebase to understand current architecture and patterns
2. Analyze the feature definition and identify unclear aspects
3. Ask the user for clarifications on aspects that significantly impact scope or user experience
4. Make reasonable decisions for minor details based on context and conventions
5. If user can't clarify, make a decision, state the assumption, and continue

PRD inherited from `/home/ozi/projects/nextjs-16-boilerplate/.zencoder/chats/59252027-3845-47b2-94d4-1913c9dc175e/requirements.md`.

### [x] Step: Technical Specification

Create a technical specification based on the PRD.

1. Review existing codebase architecture and identify reusable components
2. Define the implementation approach

Spec inherited from `/home/ozi/projects/nextjs-16-boilerplate/.zencoder/chats/59252027-3845-47b2-94d4-1913c9dc175e/spec.md`.

### [x] Step: Planning

Create a detailed implementation plan based on the spec.

1. Break down the work into concrete tasks
2. Each task should reference relevant contracts and include verification steps
3. Replace the Implementation step below with the planned tasks

Plan inherited and extended from `/home/ozi/projects/nextjs-16-boilerplate/.zencoder/chats/59252027-3845-47b2-94d4-1913c9dc175e/plan.md`.

### [ ] Step: Implementation

#### Phase 1-4: Infrastructure & Domain (Inherited from 59252027)

- [x] **1.1 Identity Contracts**: `src/core/contracts/identity.ts`
- [x] **1.2 Tenancy Contracts**: `src/core/contracts/tenancy.ts`
- [x] **1.3 Authorization Contracts**: `src/core/contracts/authorization.ts`
- [x] **1.4 Repository Contracts**: `src/core/contracts/repositories.ts`
- [x] **1.5 DI Container**: `src/core/container/index.ts`
- [x] **2.1 Clerk Identity**: `src/modules/auth/infrastructure/ClerkIdentityProvider.ts`
- [x] **2.2 Clerk Tenancy**: `src/modules/auth/infrastructure/ClerkTenantResolver.ts`
- [x] **2.3 Auth Module Registration**: `src/modules/auth/index.ts`
- [x] **3.1 Policy Engine**: `src/modules/authorization/domain/policy/PolicyEngine.ts`
- [x] **3.2 Authorization Service**: `src/modules/authorization/domain/AuthorizationService.ts`
- [x] **3.3 Authz Module Registration**: `src/modules/authorization/index.ts`
- [x] **4.1 Mock Repositories**: `src/modules/authorization/infrastructure/MockRepositories.ts`
- [x] **4.2 Global Wiring**: `src/core/container/index.ts` (bootstrap)

#### Phase 5: Framework Refactoring (IN PROGRESS)

- [x] **5.1 Security Context**: Refactor `src/security/core/security-context.ts` to use Container
- [x] **5.2 Proxy Refactoring**: Fully decouple `src/proxy.ts` from direct Clerk logic (except for the wrapper if strictly necessary, or replace with custom middleware)
- [x] **5.3 Middleware Refactoring**: Refactor `src/security/middleware/with-auth.ts` and others to use `IdentityProvider` from Container instead of `@clerk/nextjs/server`
- [x] **5.4 Onboarding Migration**: Refactor `src/actions/onboarding.ts` into `src/modules/auth/ui/onboarding-actions.ts`
- [x] **5.5 UI Component Audit**: Audit `src/app/onboarding/page.tsx` and others for direct Clerk hook usage (`useUser`, `useAuth`) and replace with domain-agnostic abstractions if possible. (Note: Kept for reload() functionality in onboarding and standard UI in Header)

#### Phase 6: Final Verification (IN PROGRESS)

- [ ] **6.1 Quality Suite**: `pnpm lint` and `pnpm typecheck` (ZERO errors and NO `any` allowed)
- [x] **6.2 Test Suite**: `pnpm test` (Ensure coverage for new modules)
- [ ] **6.3 Dependency Audit**: `pnpm skott:check:only`
- [ ] **6.4 Clerk Leakage Audit**: `grep` audit to ensure Clerk is only in Infrastructure/UI entry points.
