# PRD: Enterprise-Grade Auth/Authorization Architecture Refactor

## Background

The current codebase has a working ABAC authorization system with a DI container, but an architectural audit identified four critical issues that block safe evolution toward multi-tenant SaaS, billing, enterprise contracts, background jobs, and edge-first hosting on Vercel.

## Problems Being Solved

### P1 — ClerkIdentityProvider is runtime-coupled to edge middleware

`ClerkIdentityProvider.getCurrentIdentity()` and `ClerkTenantResolver.resolve()` both call `auth()` from `@clerk/nextjs/server` directly. This function works only when Clerk's edge middleware has established the runtime context. Any usage outside that boundary (background jobs, Stripe webhooks, cron, tests without mock setup) will fail silently or throw.

**Impact**: Cannot safely use the identity/tenant infrastructure in webhooks, background jobs, or non-Clerk runtimes. Portability to other auth providers is zero.

### P2 — authorizationModule registers MockRepositories as production defaults

`src/modules/authorization/index.ts` instantiates `MockRoleRepository`, `MockPolicyRepository`, `MockMembershipRepository`, and `MockTenantAttributesRepository` unconditionally — even in production. These are named "Mock" because they carry test-specific fixture logic (e.g. `subjectId.startsWith('user_admin')` hardcoded as admin).

**Impact**: Production runtime executes test-fixture logic. Clean Architecture boundary broken. Environment separation is non-existent.

### P3 — SecurityContext computes role hierarchy (authorization precomputation)

`createSecurityContext()` calls `roleRepository.getRoles()` and runs a `ROLE_HIERARCHY` reduction to compute `user.role`. This is authorization precomputation inside the "technical request facts" layer. SecurityContext's responsibility is to capture _who is asking_ and _from where_ — not _what they are allowed to do_.

**Impact**: Role resolution is duplicated: once in SecurityContext, once (correctly) in AuthorizationService. `SecurityContextDependencies` incorrectly includes `roleRepository`. `SecurityContext.user.role` is an RBAC shortcut that conflicts with ABAC policy evaluation.

### P4 — Global ROLE_HIERARCHY used in security layer (blocks per-tenant roles)

`ROLE_HIERARCHY` constant is used directly in `security-context.ts` and `authorization-facade.ts`. This static hierarchy cannot accommodate custom roles per tenant, dynamic roles, or enterprise role assignments.

**Impact**: Role resolution is tied to a fixed global hierarchy. Cannot support per-tenant custom roles in future.

## Goals

1. **Decouple Clerk from domain contracts** — `IdentityProvider` and `TenantResolver` implementations must not import `@clerk/nextjs/server`. All Clerk-specific logic stays in proxy.ts and dedicated infra classes.

2. **Remove mock repositories from production module** — `authorizationModule` must never register mock repositories as defaults. Environment-conditional registration must be explicit.

3. **Strip SecurityContext of authorization precomputation** — `SecurityContext.user` stores only `{ id, tenantId }`. Role resolution moves to `DefaultAuthorizationService` which becomes the single source of truth for role-enriched authorization context.

4. **Prepare authorization for per-tenant role resolution** — `DefaultAuthorizationService` calls `RoleRepository.getRoles()` internally, enriching `subject.roles` before policy evaluation. This makes roles a first-class ABAC attribute rather than a SecurityContext field.

5. **Maintain runtime correctness** — All existing tests must continue to pass (with updates for changed contracts). No behavioral regressions in middleware, server actions, or RSC.

## Non-Goals

- Implementing Prisma repositories (deferred; in-memory repositories serve as placeholders)
- Implementing feature flags module
- Implementing billing module
- Implementing enterprise contracts
- Changing PolicyEngine logic
- Changing the AuthorizationContext or TenantAttributes contracts
- Changing any UI beyond what is necessary to remove `SecurityContext.user.role` usage

## Success Criteria

- [ ] `ClerkIdentityProvider` and `ClerkTenantResolver` do not import `@clerk/nextjs/server`
- [ ] `authorizationModule.register()` uses environment-conditional registration (mock for test, in-memory for dev/prod)
- [ ] `SecurityContext.user` has no `role` field
- [ ] `createSecurityContext` has no `roleRepository` dependency
- [ ] `DefaultAuthorizationService` calls `roleRepository.getRoles()` internally and adds roles to enriched subject context
- [ ] `pnpm typecheck` passes with zero errors
- [ ] `pnpm lint` passes with zero warnings
- [ ] All existing tests pass or are updated to match new contracts

## Architectural Target

```
proxy.ts
  └── clerkMiddleware(auth, request)
        └── build RequestIdentitySource { userId, orgId, email } from auth()
              └── build request-scoped container with identity source injected
                    └── withSecurity
                          └── withAuth
                                └── AuthorizationService.can(context)
                                      └── RoleRepository.getRoles(subjectId, tenantId)
                                      └── MembershipRepository.getTenantMemberships(subjectId)
                                      └── TenantAttributesRepository.getTenantAttributes(tenantId)
                                      └── PolicyRepository.getPolicies(enrichedContext)
                                            └── PolicyEngine.evaluate(enrichedContext, policies)
```

Each layer knows only its own contracts — never Clerk, never Stripe, never Prisma directly.
