# RBAC Baseline

This document describes the current RBAC baseline after provisioning and tenancy refactors.

## 1. Canonical Role Model

Internal canonical roles are tenant-scoped and stored in DB:

- `owner`
- `member`

These roles are created/ensured per tenant by provisioning and referenced by memberships and policies.

## 2. Authorization Decision Flow

1. Identity is resolved (`IdentityProvider`) to internal user UUID.
2. Tenant context is resolved (`TenantResolver`) based on active tenancy mode.
3. `DefaultAuthorizationService.can(context)` executes:
   - membership guard (`MembershipRepository.isMember`)
   - role resolution (`RoleRepository.getRoles`)
   - tenant attributes hydration (`TenantAttributesRepository`)
   - policy retrieval (`PolicyRepository.getPolicies`)
   - policy evaluation (`PolicyEngine`, deny-overrides)

No role floor checks in middleware. Route/resource decisions flow through policy evaluation.

## 3. RBAC Data Model (DB)

Core tables:

- `roles` (`tenant_id`, `name`)
- `memberships` (`user_id`, `tenant_id`, `role_id`)
- `policies` (`tenant_id`, `role_id`, `effect`, `resource`, `actions`, `conditions`)
- `tenant_attributes` (`plan`, `features`, `max_users`, `policy_template_version`)

Important invariant:

- policy retrieval is role-scoped (member cannot inherit owner policies).

## 4. Provisioning Integration

Provisioning ensures roles and policy templates idempotently:

- owner template policies
- member template policies
- template version tracked via `tenant_attributes.policy_template_version`

Membership role outcome by mode:

1. `single` -> new user becomes `member`
2. `personal` -> new user becomes `owner`
3. `org/provider` -> mapped from provider tenant role claim
4. `org/db` -> existing membership required (no auto-create in resolver path)

## 5. Runtime Boundaries

- Edge middleware: authentication gate, onboarding redirect, route-level checks with edge-safe deps.
- Node runtime: DB-backed authorization and provisioning writes.

RBAC state changes (roles, policies, memberships) are write-path operations in provisioning/domain services, not in request resolvers.

## 6. Key Files

- `src/modules/authorization/domain/AuthorizationService.ts`
- `src/modules/authorization/domain/policy/PolicyEngine.ts`
- `src/modules/authorization/infrastructure/drizzle/DrizzlePolicyRepository.ts`
- `src/modules/authorization/infrastructure/drizzle/DrizzleRoleRepository.ts`
- `src/modules/authorization/infrastructure/drizzle/DrizzleMembershipRepository.ts`
- `src/modules/provisioning/policy/templates.ts`
- `src/modules/provisioning/infrastructure/drizzle/DrizzleProvisioningService.ts`

## 7. Regression Tests to Keep Green

- role-scoped policy fetch tests (`DrizzlePolicyRepository.db.test.ts`)
- owner/member route/action evaluation tests (`AuthorizationService.db.test.ts`)
- provisioning role assignment/escalation guard tests (`DrizzleProvisioningService.db.test.ts`)

## 8. Operational Checklist

Before shipping RBAC-affecting changes:

1. Run `pnpm typecheck`
2. Run `pnpm lint`
3. Run unit tests touching authorization/provisioning
4. Run DB tests for policy-role isolation and provisioning idempotence
5. Verify no wildcard policy regressions

## 9. Related Docs

- `docs/features/23 - ABAC Foundation.md`
- `docs/getting-started/03 - Tenancy, Organizations, Roles and Onboarding - Runtime Matrix.md`
- `docs/architecture/15 - Edge vs Node Composition Root Boundary.md`
