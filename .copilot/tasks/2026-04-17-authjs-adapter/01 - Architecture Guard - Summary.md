# Architecture Guard — AuthJS Pre-Implementation Analysis

## Agent Role

01 - Architecture Guard

## Task

Pre-implementation analysis: tenant/organization model correctness + Clerk feature completeness audit before AuthJS implementation.

## Status: BLOCKING — Design Decision Required Before Any Implementation

---

## PART 1: Tenant vs Organization — Current State Analysis

### What the Code Actually Has

The DB schema uses a single-level model:

```
users → memberships → tenants (with roles scoped to tenant)
```

**`tenants` table:** `{ id, name, createdAt }` — minimal entity, no hierarchy  
**`tenant_attributes`:** `{ plan, contractType, features, maxUsers }` — billing/plan info  
**`memberships`:** `{ userId, tenantId, roleId }` — user↔tenant membership  
**`roles`:** `{ id, tenantId, name, isSystem }` — owner + member per tenant  
**`policies`:** scoped to `(tenantId, roleId)` — ABAC policy store

### The Conflation Problem (Confirmed in Code)

**The `tenants` table IS functioning as "Organization" in the sense of the tenants-vs-orgs document.** It is the business grouping unit — users belong to it, resources are scoped by it, roles are inside it.

The naming implies it's an isolation boundary (tenant) but the data model is actually an operational unit (organization). In simpler B2B cases (Variant B) this conflation is acceptable. For Variant C it fails.

### Variant B vs Variant C — What the Boilerplate Currently Supports

| Feature                             | Variant B (org = tenant, current)                  | Variant C (tenant > org, needed) |
| ----------------------------------- | -------------------------------------------------- | -------------------------------- |
| One business entity per client      | ✅ Supported                                       | ✅ Would require new layer       |
| Multiple schools under one EduGroup | ❌ Not supported                                   | ✅ Needed                        |
| Central billing per client group    | ❌ Not modeled (only per "tenant")                 | ✅ Tenant = billing boundary     |
| Local admin per school              | ❌ All roles scoped to "tenant" only               | ✅ Org-scoped roles needed       |
| User in multiple schools            | ❌ One membership per tenant (PK: userId+tenantId) | ✅ Multiple org memberships      |
| SSO per client group                | ❌ No SSO config at tenant level                   | ✅ Tenant-level SSO config       |

### Evidence: Memberships PK Prevents Multi-Org Per Tenant

```typescript
// src/modules/authorization/infrastructure/drizzle/schema.ts
primaryKey({ columns: [t.userId, t.tenantId] }),
```

This composite PK means **a user can be a member of at most ONE role within one tenant**. For Variant C (user = teacher in School A and School B within EduGroup), this must change to `primaryKey({ columns: [t.userId, t.organizationId] })`.

### Clerk's Hard Architectural Constraint

**Clerk's org model is flat** — there is no "tenant above org" concept in Clerk's API:

- `orgId` in session = one active org
- Clerk Enterprise can federate orgs but not create a parent-child hierarchy
- `OrganizationSwitcher` shows all Clerk orgs the user belongs to — it IS the org list, not a sub-level list

**What this means for TENANCY_MODE=org+provider with Clerk:**
Currently `(provider='clerk', externalTenantId='org_xxx')` maps to one internal `tenant`. If we add a real parent-tenant above this, the Clerk org would map to an internal `organization`, not a top-level `tenant`.

**Clerk cannot provide a native top-level tenant** for Variant C. The "EduGroup" entity would be purely DB-level with no Clerk equivalent. This is architecturally correct — Clerk provides identity and org membership, our DB provides the enterprise group hierarchy.

---

## PART 2: ClerkUserRepository — Orphaned Code Finding

### Critical Drift Detected

```typescript
// src/modules/auth/infrastructure/ClerkUserRepository.ts
export class ClerkUserRepository implements UserRepository {
  async findById(userId) {
    /* calls clerkClient().users.getUser() */
  }
  async updateProfile(userId, profile) {
    /* calls clerkClient().users.updateUser() with publicMetadata */
  }
  async updateOnboardingStatus(userId, complete) {
    /* calls clerkClient().users.updateUser() with publicMetadata */
  }
}
```

```typescript
// src/modules/auth/index.ts — ACTUAL WIRING
const userRepository: UserRepository = new DrizzleUserRepository(db); // ← NOT ClerkUserRepository
```

**`ClerkUserRepository` is wired nowhere.** `DrizzleUserRepository` handles all user operations including those previously expected to go to Clerk. This creates a dual truth risk:

- Onboarding writes `displayName`, `locale`, `timezone` to the DB via `DrizzleUserRepository.updateProfile()`
- The `ClerkUserRepository` would write them to Clerk's `publicMetadata` instead
- Since it's not wired, user profile data is ONLY in the DB — not in Clerk at all

**Assessment:** `ClerkUserRepository` is dead code. Should be explicitly removed or documented as intentionally decommissioned. The DB is the correct source of truth for user profile data.

---

## PART 3: Missing Domain Features (What Clerk Provides That the App Uses)

### Feature Audit: Clerk Usage Inventory

| #   | Clerk API/Component                  | Used In                                  | AuthJS Equivalent                        | Gap Status                         |
| --- | ------------------------------------ | ---------------------------------------- | ---------------------------------------- | ---------------------------------- |
| 1   | `auth()` from `@clerk/nextjs/server` | `ClerkRequestIdentitySource`, `proxy.ts` | `auth()` from Auth.js                    | 🟡 Needs implementation            |
| 2   | `clerkMiddleware()`                  | `proxy.ts`                               | `auth` middleware from `auth.config.ts`  | 🟡 Needs implementation            |
| 3   | `clerkClient().users.getUser()`      | `ClerkUserRepository` (dead code)        | N/A — DB is source of truth              | ✅ No action needed                |
| 4   | `ClerkProvider`                      | `layout.tsx`                             | `SessionProvider` from `next-auth/react` | 🟡 Needs implementation            |
| 5   | `<SignIn />` component               | `sign-in-client.tsx`                     | Custom form with `signIn()`              | 🔴 Full custom build needed        |
| 6   | `<SignUp />` component               | `sign-up-client.tsx`                     | Custom form or same as sign-in           | 🔴 Full custom build needed        |
| 7   | `<SignInButton>`                     | `HeaderAuthControls.tsx`                 | Custom button calling `signIn()`         | 🟡 Simple wrapper                  |
| 8   | `<SignUpButton>`                     | `HeaderAuthControls.tsx`                 | Custom button (redirect to sign-in)      | 🟡 Simple wrapper                  |
| 9   | `<SignedIn>` / `<SignedOut>`         | `HeaderAuthControls.tsx`                 | Session status from `useSession()`       | 🟡 Simple conditional              |
| 10  | `<UserButton>`                       | `HeaderAuthControls.tsx`                 | Custom user menu using session           | 🔴 Full custom build needed        |
| 11  | `useClerk()` → `signOut()`           | `bootstrap-error.tsx`                    | `signOut()` from `next-auth/react`       | 🟡 Drop-in replacement             |
| 12  | `<OrganizationSwitcher>`             | `bootstrap-org-required.tsx`             | ❌ NO EQUIVALENT                         | 🔴 Must be custom-built from DB    |
| 13  | `<Waitlist>`                         | `waitlist/page.tsx`                      | ❌ NO EQUIVALENT                         | 🔴 Must be custom-built or removed |
| 14  | Session claims: `email`              | `ClerkRequestIdentitySource`             | `session.user.email`                     | 🟡 Direct mapping                  |
| 15  | Session claims: `orgId`              | `ClerkRequestIdentitySource`             | ❌ No native equivalent                  | 🔴 Custom session field needed     |
| 16  | Session claims: `orgRole`            | `ClerkRequestIdentitySource`             | ❌ No native equivalent                  | 🔴 Custom session field needed     |
| 17  | Session claims: `email_verified`     | `ClerkRequestIdentitySource`             | Provider-dependent                       | 🟡 Per-provider mapping needed     |

### Missing Features Never Implemented (Expected But Absent)

These features are **defined in contracts/policies but have NO implementation**:

| Feature                                | Where Defined                           | Implementation Status                                        |
| -------------------------------------- | --------------------------------------- | ------------------------------------------------------------ |
| User invitation (`USER_INVITE` action) | `resources-actions.ts`, `ownerPolicies` | ❌ No invitation table, no invitation service, no email flow |
| Registration-closed / invite-only mode | Implied by waitlist page                | ❌ Entirely Clerk-managed via dashboard setting              |
| Organization-level SSO config          | Implied by Variant C discussion         | ❌ Not in DB schema                                          |
| Organization creation/management UI    | `OrganizationSwitcher` is Clerk-only    | ❌ No custom org management                                  |
| Branding per tenant/org                | Not defined anywhere                    | ❌ Not in scope yet                                          |

### `bootstrap-org-required.tsx` — Clerk-Specific, Not Abstractable As-Is

```typescript
// Uses Clerk's OrganizationSwitcher — has NO provider-agnostic equivalent
import { OrganizationSwitcher } from '@clerk/nextjs';

export function BootstrapOrgRequired({ redirectUrl }) {
  return (
    <OrganizationSwitcher
      hidePersonal
      createOrganizationMode="modal"
      afterSelectOrganizationUrl={continueUrl}
      afterCreateOrganizationUrl={continueUrl}
    />
  );
}
```

For `AUTH_PROVIDER=authjs` with `TENANCY_MODE=org+provider`: this Clerk component cannot be used. And per the previous analysis, `TENANCY_MODE=org+provider` should be unsupported for AuthJS. BUT for `TENANCY_MODE=org+db`, the equivalent would be a custom "select your organization" UI populated from the DB — not Clerk.

---

## PART 4: Architectural Decision Required

### Decision Matrix

| Option | Description                                                                   | Effort | Risk                        | Recommendation                                   |
| ------ | ----------------------------------------------------------------------------- | ------ | --------------------------- | ------------------------------------------------ |
| A      | Keep current single-level model (tenant = org). Document Variant C as future. | Low    | Low (now)                   | ❌ User explicitly wants Variant C as sample app |
| B      | Add `parent_tenant_id` self-reference to `tenants` table                      | Medium | Medium                      | ❌ Confusing — "tenants" table holds both levels |
| C      | Add new `organizations` table below `tenants`. Restructure memberships.       | High   | High (before both adapters) | ✅ Architecturally correct                       |
| D      | Rename `tenants` → `organizations`. Add new `tenants` table above.            | High   | High (breaking rename)      | ✅ Most semantically correct                     |

### Recommended Decision: Option C (Extended Schema) — Do Before AuthJS

**Why before AuthJS:**

- If schema changes after both adapters are implemented, BOTH adapters need refactoring
- AuthJS has no org concept — it's the right time to design the DB correctly
- The provisioning service, authorization service, and all contracts would need touching either way

### Proposed Extended Schema for Variant C

```sql
-- Level 1: Top-level isolation boundary (billing, SSO, compliance)
tenants: { id, name, slug, plan, billing_ref, sso_config, created_at }
-- maps to: EduGroup, Acme Corp, Customer XYZ

-- Level 2: Business unit within a tenant
organizations: { id, tenant_id (FK → tenants), name, slug, type, settings, created_at }
-- maps to: School A, School B, Team Sales, Department HR

-- Level 3: User membership in an organization (with role)
memberships: { user_id, organization_id (FK → organizations), role_id, created_at }
-- PK: (user_id, organization_id) — user can be in multiple orgs

-- Roles and policies scoped to organizations (or potentially tenant-global)
roles: { id, organization_id (FK → organizations), name, is_system }
policies: { id, organization_id (FK → organizations), role_id, effect, resource, actions }
```

**Backwards compatibility for simple Variant B (single org per tenant):**

- When provisioning a simple B2B client: create one `tenant` + one `organization` automatically
- The `organization` IS the "workspace" the user works in
- For `TENANCY_MODE=single`: one global tenant + one global organization
- For `TENANCY_MODE=personal`: one tenant per user + one personal organization per user

**Auth identity mapping:**

```sql
auth_user_identities: { provider, external_user_id, user_id (FK → users) }  -- unchanged
auth_tenant_identities: { provider, external_tenant_id, tenant_id (FK → tenants) }  -- top-level tenant mapping
auth_org_identities: { provider, external_org_id, organization_id (FK → organizations) }  -- org-level mapping (new)
```

For Clerk: `orgId` → `auth_org_identities` mapping to an `organization` within a `tenant`  
For AuthJS: no org mapping needed from provider (all app-level)

### Impact on Contracts

The following contracts would need to change:

| Contract                                             | Current                          | Change Needed                                           |
| ---------------------------------------------------- | -------------------------------- | ------------------------------------------------------- |
| `TenantContext`                                      | `{ tenantId, userId }`           | Add `organizationId?: string`                           |
| `TenantResolver`                                     | Resolves tenantId                | Also resolves organizationId                            |
| `MembershipRepository.isMember(subjectId, tenantId)` | Checks tenant membership         | Need `isMember(subjectId, organizationId)`              |
| `PolicyRepository.getPolicies(context)`              | Policies by tenantId             | Policies by organizationId (+ optionally tenant-global) |
| `AuthorizationContext.tenant.tenantId`               | The tenant isolation boundary    | Keep as tenant; add org context                         |
| `ProvisioningInput`                                  | `tenantExternalId`, `tenantRole` | Add `orgExternalId`, `orgRole`                          |
| `ProvisioningResult`                                 | `internalTenantId`               | Add `internalOrgId`                                     |

---

## PART 5: Architecture Verdict

### Current State

- **Tenant model**: Single-level, correct for Variant B, insufficient for Variant C
- **ClerkUserRepository**: Orphaned — not wired, safe to remove
- **Invitation system**: Undefined at DB/service level — only the policy action exists
- **Organization concept**: Missing entirely — `tenant` does double duty
- **Waitlist**: 100% Clerk-managed, needs full custom implementation for AuthJS

### Blocking Decisions Required

1. **Tenant/Organization hierarchy**: Choose Option C or D before any AuthJS implementation. This affects DB schema, contracts, provisioning, and authorization — touching both adapters.

2. **Invitation system scope**: Is invitation management in scope for the AuthJS implementation? If yes, add to schema now. The `USER_INVITE` action in policies implies it should exist.

3. **Waitlist scope**: Is custom waitlist management in scope? Or only for Clerk?

4. **ClerkUserRepository**: Explicitly remove or document as decommissioned. It creates confusion.

### What Should NOT Be Implemented Until Decisions Are Made

- ❌ AuthJS `RequestIdentitySource` implementation (would target wrong schema)
- ❌ AuthJS provisioning (would create wrong tenant structure)
- ❌ Any UI components that assume single-level org model
- ❌ The `bootstrap-org-required.tsx` equivalent for AuthJS (org model unclear)

### Safe Pre-Work (Can Proceed Independently)

- ✅ `next-auth` package installation
- ✅ `auth.config.ts` / `auth.ts` basic setup
- ✅ Route handler `/api/auth/[...nextauth]/route.ts`
- ✅ `auth()` JWT session configuration
- ✅ `AUTH_SECRET` env var addition

These are identity-layer-only changes that don't touch the tenant/org model.
