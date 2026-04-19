# Auth Foundation Redesign — Phase 1 Complete / Phase 2 Handoff

**Date**: 2026-04-18  
**Branch**: `fix/db-setup`  
**Task directory**: `.copilot/tasks/2026-04-17-auth-foundation-redesign/`  
**Master plan**: `.copilot/tasks/2026-04-17-auth-foundation-redesign/plan.md`

---

## Phase 1 Status: ✅ COMPLETE

All Phase 1 steps are ticked in `plan.md`. Final validation:

- **typecheck**: 0 errors
- **lint**: 0 errors, 4 pre-existing security warnings (known false positives)
- **unit tests**: 1029/1029 pass (146 test files)
- **integration tests**: 69/69 pass
- **db tests**: 67/67 pass (PGlite — full migration applied)
- **Dev auth**: manually tested against real Postgres after `db:reset` — Clerk auth + provisioning flow confirmed working

---

## What Phase 1 Delivered

### New DB Tables

- **`organizations`**: `id`, `tenant_id (FK→tenants)`, `name`, `slug`, `status`, `created_at`
- **`invitations`**: `id`, `organization_id (FK→organizations)`, `invited_by_user_id`, `email`, `role_id`, `token`, `status`, `expires_at`, `accepted_at`, `created_at`
- **`waitlist_entries`**: `id`, `email`, `name`, `organization_id`, `tenant_id`, `status`, `approved_at`, `notified_at`, `created_at`

### Renamed Tables / Columns

- `auth_tenant_identities` → `auth_organization_identities`
- `external_tenant_id` → `external_org_id`
- `tenant_id` → `organization_id` in: `memberships`, `roles`, `policies`, `auth_organization_identities`

### Tenants Table Additions

- `slug` column (unique, nullable)
- `status` column (default `'active'`)

### Tenant Attributes Addition

- `max_organizations` column (default `1`)

### Migration File

`src/core/db/migrations/generated/0008_auth_foundation_redesign.sql` — written manually (Drizzle interactive prompt not available in non-TTY).

### Infrastructure Updates (all schema-follow changes)

- `DrizzleMembershipRepository`, `DrizzleRoleRepository`, `DrizzlePolicyRepository` — `organizationId` columns
- `DrizzleExternalIdentityMapper`, `DrizzleInternalIdentityLookup` — `authOrganizationIdentitiesTable` with `externalOrgId`/`organizationId`
- `DrizzleProvisioningService` — creates **both** tenant + org rows; `internalTenantId` in result semantically holds org ID; `_parentTenantId` tracked for `tenant_attributes`
- `seed.ts` — now returns `{ tenants, orgs, roles }` with fixed UUIDs for orgs
- All db tests updated to use `auth.orgs.acmeHq.id` / `auth.orgs.globexHq.id` (not tenant IDs) for membership/policy/role lookups
- `DrizzleInternalIdentityLookup.test.ts` — mock rows updated from `{ tenantId }` to `{ organizationId }`
- `src/core/db/schema/references.ts` — `organizationsReferenceTable` added
- `src/modules/provisioning/infrastructure/drizzle/schema.ts` — re-exports `organizationsTable`, `invitationsTable`, `waitlistEntriesTable`

### Codacy / ESLint Fixes (user applied)

- `bootstrap-error.tsx` — `useClerk()` dependency preserved (sign-out only, not identity); `switch` statement replaces `Object.create(null)` dispatch
- `with-error-handler.ts`, `with-action-handler.ts` — `Map`-based zod error aggregation (no dynamic key injection)
- `action-audit.ts` — `Object.fromEntries(entries)` pattern (no dynamic key write)
- `data-sanitizer.ts` — `Object.fromEntries(entries)` pattern
- `edge.ts` — `switch` statements replace `Record<Level, ...>` lookups
- `ClerkRequestIdentitySource.ts` — `Map.get()` for session claim lookup
- `CookieActiveTenantSource.test.ts`, `HeaderActiveTenantSource.test.ts` — safe iteration helpers
- `DrizzleMembershipRepository.test.ts`, `DrizzlePolicyRepository.test.ts`, `DrizzleRoleRepository.test.ts`, `DrizzleTenantAttributesRepository.test.ts` — `Object.fromEntries` / `Object.assign` mock patterns
- `StaticFeatureFlagService.ts` — safe Map-based lookup
- `run-migrations.ts` — typed cast instead of `any`
- `env.test.ts` — `process.env = Object.fromEntries(...) as NodeJS.ProcessEnv`
- `eslint.config.mjs` — new rules for scripts + e2e: dynamic `process.env[key]` warn; bare-identifier `fs.*Sync` path warn
- `SECURITY_CODING_PATTERNS.md` — updated with new confirmed patterns

---

## Key Architectural Invariant (Phase 1 Bridge State)

**`internalTenantId` in `ProvisioningResult` semantically holds the organization ID** (not the tenant ID). This is intentional for backward compatibility — all callers that consume `internalTenantId` actually need the org context. Phase 3 will rename this to `internalOrganizationId` and clean up the variable names. Until then:

- `_parentTenantId` in `resolveTenant()` tracks the actual tenant-level ID for `tenant_attributes` operations
- Auth flow: Clerk → provisioning → `auth_organization_identities` → org ID → memberships/roles/policies all scoped to org

---

## Phase 2: Contract Redesign — What to Do Next

**Read first**: `.copilot/tasks/2026-04-17-auth-foundation-redesign/plan.md` sections "Phase 2" and "Key Design Decisions".

### Phase 2 Steps

| Step | Description                                                                 | Files affected                                                                     |
| ---- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 2.1  | `identity.ts` — `orgExternalId` replaces `tenantExternalId`                 | `src/core/contracts/identity.ts`                                                   |
| 2.2  | `tenancy.ts` — `OrganizationContext` with `organizationId` + `tenantId`     | `src/core/contracts/tenancy.ts`                                                    |
| 2.3  | `repositories.ts` — `MembershipRepository` uses `organizationId`            | `src/core/contracts/repositories.ts`                                               |
| 2.4  | Add `OrganizationId` primitive type                                         | `src/core/contracts/`                                                              |
| 2.5  | `InternalIdentityLookup` — `findInternalOrganizationId()`                   | `src/core/contracts/identity.ts`, `DrizzleInternalIdentityLookup.ts`               |
| 2.6  | `ProvisioningResult` — `internalOrganizationId` replaces `internalTenantId` | `src/core/contracts/provisioning.ts`, `DrizzleProvisioningService.ts`, all callers |

**Validation gate**: typecheck must pass across all consuming modules after Phase 2.

### Important Constraints for Phase 2

- `tenantId` in `AuthorizationContext.tenant.tenantId` currently accepts the **org ID** (Phase 1 bridge). Phase 2 should introduce `organizationId` as the canonical field and keep `tenantId` as a deprecated alias OR update all callers at once.
- `MembershipRepository.isMember(subjectId, tenantId)` signature uses `TenantId` type but semantically receives org ID — Phase 2 should rename the parameter type or add an overload.
- Callers to check: `src/app/auth/bootstrap/`, `src/modules/provisioning/`, `src/security/`, `src/app/api/`

---

## Files to Read Before Starting Phase 2

1. `AGENTS.md` — always-applied context
2. `.copilot/tasks/2026-04-17-auth-foundation-redesign/plan.md` — master plan with all phases
3. `.copilot/tasks/2026-04-17-auth-foundation-redesign/final-design-verdict.md` — approved design decisions
4. `src/core/contracts/identity.ts` — current contract shapes
5. `src/core/contracts/tenancy.ts` — current tenancy context
6. `src/core/contracts/repositories.ts` — current repository contracts
7. `src/core/contracts/provisioning.ts` — current ProvisioningResult shape
8. `src/modules/provisioning/infrastructure/drizzle/DrizzleProvisioningService.ts` — Phase 1 bridge state

---

## Leantime Task Reference

Phase 2 Leantime task ID: **61** (created in Phase 0, status should be set to `W toku` (4) when starting).

```shell
pnpm lt -- run tasks.patch --input '{"id":61,"status":4}' --format=json
```
