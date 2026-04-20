# Phase 2 — Contract Redesign: Implementation Report

**Task**: Auth Foundation Redesign — Phase 2  
**Workflow Step**: Implementation  
**Date**: 2026-04-18  
**Branch**: `fix/db-setup`

---

## Steps Completed

| Step | Description                                                         | Status |
| ---- | ------------------------------------------------------------------- | ------ |
| 2.1  | `identity.ts` — `orgExternalId`, `findInternalOrganizationId`       | ✅     |
| 2.2  | `tenancy.ts` — `organizationId: OrganizationId` in `TenantContext`  | ✅     |
| 2.3  | `repositories.ts` — `MembershipRepository.isMember(organizationId)` | ✅     |
| 2.4  | `primitives.ts` — `OrganizationId` type added                       | ✅     |
| 2.5  | `DrizzleInternalIdentityLookup` — `findInternalOrganizationId()`    | ✅     |
| 2.6  | `ProvisioningResult.internalOrganizationId` + all callers           | ✅     |

---

## Files Changed

**Contracts (6):**

- `src/core/contracts/primitives.ts`
- `src/core/contracts/identity.ts`
- `src/core/contracts/tenancy.ts`
- `src/core/contracts/repositories.ts`
- `src/core/contracts/provisioning-access.ts`
- `src/modules/provisioning/domain/ProvisioningService.ts`

**Infrastructure implementations (10):**

- `src/modules/auth/infrastructure/drizzle/DrizzleInternalIdentityLookup.ts`
- `src/modules/auth/infrastructure/clerk/ClerkRequestIdentitySource.ts`
- `src/modules/auth/infrastructure/system/SystemIdentitySource.ts`
- `src/modules/auth/infrastructure/RequestScopedTenantResolver.ts`
- `src/modules/provisioning/infrastructure/OrgProviderTenantResolver.ts`
- `src/modules/provisioning/infrastructure/PersonalTenantResolver.ts`
- `src/modules/provisioning/infrastructure/SingleTenantResolver.ts`
- `src/modules/provisioning/infrastructure/OrgDbTenantResolver.ts`
- `src/modules/authorization/infrastructure/drizzle/DrizzleMembershipRepository.ts`
- `src/modules/provisioning/infrastructure/drizzle/DrizzleProvisioningService.ts`

**App-layer + security (6):**

- `src/app/auth/build-provisioning-input.ts`
- `src/app/auth/bootstrap/resolve-bootstrap-outcome.ts`
- `src/app/onboarding/actions.ts`
- `src/app/api/me/provisioning-status/route.ts`
- `src/proxy.ts`
- `src/security/core/node-provisioning-access.ts`

**Tests (25 files):**
All unit, integration, and factory test files touching the renamed fields.

---

## Key Design Decisions Made

1. **`TenantContext` kept, not renamed** — `organizationId` added as new required field alongside `tenantId`. Both hold the same value (org UUID). Backward compat preserved for `AuthorizationContext.tenant.tenantId` consumers.

2. **Internal `internalTenantId` variable retained in `DrizzleProvisioningService`** — only the `ProvisioningResult` output uses `internalOrganizationId`. Phase 3 will clean up internal variable names.

3. **`findPersonalTenantId()` not renamed** — intentional; name matches the public contract that hasn't changed. Phase 3 scope.

---

## Validation Gate

- ✅ `pnpm typecheck` — 0 errors
- ✅ `pnpm test` — 1028/1028 pass
- ✅ `pnpm test:integration` — 69/69 pass
- ✅ `pnpm lint --fix` — 0 errors
