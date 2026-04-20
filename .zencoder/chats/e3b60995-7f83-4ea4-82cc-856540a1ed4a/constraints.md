# Phase 2 — Contract Redesign: Constraints

**Task**: Auth Foundation Redesign — Phase 2  
**Workflow Step**: Feature Constraints  
**Task directory**: `.copilot/tasks/2026-04-17-auth-foundation-redesign/`  
**Date**: 2026-04-18

---

## Objective

Rename all Phase 1 bridge-state identifiers to their correct semantic names across contracts and callers, and introduce `OrganizationId` as the canonical primitive type. All callers must compile with zero TypeScript errors after this phase.

---

## Skipped Specialist Steps

| Step                     | Reason                                                           |
| ------------------------ | ---------------------------------------------------------------- |
| Feature Intake           | Phase 1 handoff document provides complete context               |
| Architecture Design      | Approved in Phase 0; no new structural decisions                 |
| Security Review          | Contract renaming, no new auth surface or trust boundary changes |
| Runtime Review           | No server/client placement, caching, or route-handler changes    |
| E2E Verification         | No browser-visible behavior changes                              |
| Final Architecture Check | Boundary unchanged; contract rename only                         |

---

## Architecture Constraints

- **Boundary**: All changes are within `src/core/contracts/` and infrastructure adapters that implement those contracts.
- **Module ownership**: `identity.ts` and `provisioning.ts` domain contracts are owned by `src/core/`. Infrastructure adapters in `src/modules/auth/` and `src/modules/provisioning/` implement them.
- **Dependency direction**: Consumers depend on contracts. Contracts must not import from infrastructure.
- `OrganizationId` type goes in `src/core/contracts/primitives.ts` alongside `TenantId`, `SubjectId`, `RoleId`.

---

## Security Constraints

- No new auth surface is introduced.
- The rename `tenantExternalId` → `orgExternalId` in `RequestIdentitySourceData` must be propagated to **all** infrastructure sources (`ClerkRequestIdentitySource`, `SystemIdentitySource`, `ExternalIdentityMapper`, etc.) to avoid silent data loss.
- `findInternalOrganizationId()` replaces `findInternalTenantId()` — the lookup semantics are identical (the underlying table changed in Phase 1 to `auth_organization_identities`). No security boundary change.
- `ProvisioningResult.internalOrganizationId` must replace `internalTenantId` — callers that forward this ID to membership/role/policy repositories must receive the org ID (correct since Phase 1 DB migration).

---

## Runtime Constraints

- No Edge/Node placement changes.
- No `export const dynamic` or `export const runtime` additions allowed (`cacheComponents: true` hard constraint).
- `ProvisioningStatusSnapshot.internalTenantId` in `provisioning-access.ts` may need a companion `internalOrganizationId` field — assess during implementation.

---

## Explicitly Allowed Changes

- Rename `tenantExternalId` → `orgExternalId` in `RequestIdentitySourceData` (identity.ts)
- Rename `findInternalTenantId()` → `findInternalOrganizationId()` in `InternalIdentityLookup` interface + all implementations
- Add `OrganizationId` primitive type to `primitives.ts`
- Add `organizationId: OrganizationId` to `TenantContext` (tenancy.ts) — keep `tenantId` present for full-tenant context
- Rename `MembershipRepository.isMember(subjectId, tenantId)` parameter from `tenantId: TenantId` to `organizationId: OrganizationId` — the semantic reality since Phase 1
- Rename `ProvisioningResult.internalTenantId` → `internalOrganizationId` in domain contract + all callers
- Update all tests that reference renamed fields
- Update `ProvisioningStatusSnapshot` if needed for consistency

---

## Explicitly Forbidden Changes

- Do NOT add new business logic — this is rename/reshape only
- Do NOT move provisioning or auth logic between modules
- Do NOT introduce any `export const dynamic` or `export const runtime` segment config
- Do NOT auto-create organizations or tenants in the read-path (`InternalIdentityLookup`)
- Do NOT break the `internalUserId` field in `ProvisioningResult` (unchanged)
- Do NOT skip updating any caller — typecheck must pass as the validation gate

---

## Protected Invariants

- `InternalIdentityLookup` is pure read-path — zero write side-effects (unchanged)
- `ProvisioningService.ensureProvisioned()` must run all steps in a single atomic transaction (unchanged)
- `MembershipRepository` must not return roles or policies (unchanged)
- The contract file must not import from infrastructure (unchanged)

---

## Caller Map (Files Requiring Updates)

| File                                                                                    | Field(s) changing                                                                                    |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `src/core/contracts/identity.ts`                                                        | `tenantExternalId` → `orgExternalId`; `findInternalTenantId()` → `findInternalOrganizationId()`      |
| `src/core/contracts/tenancy.ts`                                                         | Add `organizationId: OrganizationId` to `TenantContext`                                              |
| `src/core/contracts/repositories.ts`                                                    | `MembershipRepository.isMember()` param type                                                         |
| `src/core/contracts/primitives.ts`                                                      | Add `OrganizationId`                                                                                 |
| `src/modules/provisioning/domain/ProvisioningService.ts`                                | `ProvisioningResult.internalTenantId` → `internalOrganizationId`                                     |
| `src/modules/auth/infrastructure/drizzle/DrizzleInternalIdentityLookup.ts`              | Implement `findInternalOrganizationId()`                                                             |
| `src/modules/auth/infrastructure/drizzle/DrizzleInternalIdentityLookup.test.ts`         | Update mock/assertions                                                                               |
| `src/modules/auth/infrastructure/clerk/ClerkRequestIdentitySource.ts`                   | `tenantExternalId` → `orgExternalId`                                                                 |
| `src/modules/auth/infrastructure/clerk/ClerkRequestIdentitySource.test.ts`              | Update assertions                                                                                    |
| `src/modules/auth/infrastructure/ExternalIdentityMapper.ts`                             | `tenantExternalId` → `orgExternalId`                                                                 |
| `src/modules/auth/infrastructure/system/SystemIdentitySource.ts`                        | `tenantExternalId` → `orgExternalId`                                                                 |
| `src/modules/auth/infrastructure/system/SystemIdentitySource.test.ts`                   | Update assertions                                                                                    |
| `src/modules/auth/infrastructure/RequestScopedTenantResolver.ts`                        | `tenantExternalId` → `orgExternalId`; `findInternalTenantId` → `findInternalOrganizationId`          |
| `src/modules/auth/infrastructure/RequestScopedTenantResolver.test.ts`                   | Update                                                                                               |
| `src/modules/auth/infrastructure/RequestScopedIdentityProvider.test.ts`                 | Update                                                                                               |
| `src/modules/provisioning/infrastructure/drizzle/DrizzleProvisioningService.ts`         | `internalTenantId` → `internalOrganizationId` in result                                              |
| `src/modules/provisioning/infrastructure/drizzle/DrizzleProvisioningService.test.ts`    | Update assertions                                                                                    |
| `src/modules/provisioning/infrastructure/drizzle/DrizzleProvisioningService.db.test.ts` | Update assertions                                                                                    |
| `src/modules/provisioning/infrastructure/OrgProviderTenantResolver.ts`                  | `tenantExternalId` → `orgExternalId`; `findInternalTenantId` → `findInternalOrganizationId`          |
| `src/modules/provisioning/infrastructure/OrgProviderTenantResolver.test.ts`             | Update                                                                                               |
| `src/modules/provisioning/infrastructure/PersonalTenantResolver.ts`                     | `internalTenantId` → `internalOrganizationId`                                                        |
| `src/modules/provisioning/infrastructure/PersonalTenantResolver.test.ts`                | Update                                                                                               |
| `src/modules/provisioning/infrastructure/OrgDbTenantResolver.ts`                        | `internalTenantId` → `internalOrganizationId`; `findInternalTenantId` → `findInternalOrganizationId` |
| `src/modules/provisioning/infrastructure/OrgDbTenantResolver.test.ts`                   | Update                                                                                               |
| `src/app/auth/bootstrap/resolve-bootstrap-outcome.ts`                                   | `internalTenantId` → `internalOrganizationId`                                                        |
| `src/app/auth/build-provisioning-input.ts`                                              | `tenantExternalId` → `orgExternalId`                                                                 |
| `src/app/auth/build-provisioning-input.test.ts`                                         | Update                                                                                               |
| `src/app/onboarding/actions.ts`                                                         | `internalTenantId` → `internalOrganizationId`                                                        |
| `src/app/onboarding/actions.test.ts`                                                    | Update                                                                                               |
| `src/app/api/me/provisioning-status/route.ts`                                           | `internalTenantId` → `internalOrganizationId`                                                        |
| `src/testing/integration/provisioning-status-route.integration.test.ts`                 | Update                                                                                               |
| `src/proxy.ts`                                                                          | `tenantExternalId` → `orgExternalId`                                                                 |
| `src/core/contracts/provisioning-access.ts`                                             | Consider adding `internalOrganizationId` to `ProvisioningStatusSnapshot`                             |

---

## Validation Gate

Typecheck must pass: `pnpm typecheck` → 0 errors.
Unit tests must pass: `pnpm test` → all green.
Integration tests must pass: `pnpm test:integration` → all green.
