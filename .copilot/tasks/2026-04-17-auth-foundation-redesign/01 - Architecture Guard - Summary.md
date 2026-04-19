# 01 - Architecture Guard — Task Summary

**Task**: Auth Foundation Redesign (`2026-04-17-auth-foundation-redesign`)
**Agent**: 01 — Architecture Guard
**Status**: ✅ APPROVED — Final verdict issued 2026-04-17

---

## Architecture Guard Final Verdict

### Decision: Two-Level Model CONFIRMED

The `tenants → organizations → memberships` two-level model is **architecturally correct, necessary, and well-designed**. The verdict is APPROVED with the clarifications below.

---

## Conceptual Foundation

Based on `docs/other/tenants-vs-orgs.md` and `docs/other/orgs-and-clerk.md`:

| Concept          | Role                                                                                                       | Maps To                                   |
| ---------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| **Tenant**       | Isolation boundary. Data, billing, security, compliance per platform client. Never a Clerk-native concept. | `tenants` table (app-level DB entity)     |
| **Organization** | Operational unit. Teams, companies, workspaces. Users belong to orgs.                                      | `organizations` table + provider identity |

**Critical distinction confirmed**: Clerk Organizations are operational units (B2B team/company accounts), NOT isolation boundaries. Clerk does not support the "Platforms" scenario (isolated user pools per customer). Therefore:

- `tenants` table is ALWAYS an app-level domain entity — no provider creates it natively
- `organizations` table maps to what providers call "organizations", "workspaces", "teams"
- This distinction must be preserved even if apps only use one level

---

## Provider Mapping Rules (Authoritative)

### Clerk

| App Level                       | Clerk Native              | Our DB                                                   |
| ------------------------------- | ------------------------- | -------------------------------------------------------- |
| Tenant (isolation boundary)     | ❌ Not natively supported | `tenants` table — auto-created on first org provisioning |
| Organization (operational unit) | ✅ Clerk Organization     | `organizations` table                                    |
| Org external ID                 | `clerk.org.id`            | `auth_organization_identities.externalOrgId`             |
| User membership                 | Clerk `orgMembership`     | `memberships` table                                      |
| Roles                           | Clerk `orgRole` (string)  | `roles` table (mapped via provisioning)                  |

**Rule**: `clerkOrgId` MUST map to `organizations.id`, NEVER to `tenants.id`.

### AuthJS (next-auth v5)

| App Level     | AuthJS Native              | Our DB                                   |
| ------------- | -------------------------- | ---------------------------------------- |
| Tenant        | ❌ Not native              | `tenants` table — auto-created           |
| Organization  | ❌ Not native              | `organizations` table — DB-only          |
| Org context   | Custom JWT claim (`orgId`) | Stored in `auth_organization_identities` |
| Org switching | ❌ Not native              | DB query + session update + JWT re-issue |

**Rule**: AuthJS `externalOrgId` = `organizations.id` (self-referential — DB IS the org identity). JWT carries `orgId` as custom claim after user selects active org.

### Supabase Auth

| App Level    | Supabase Native                | Our DB                                   |
| ------------ | ------------------------------ | ---------------------------------------- |
| Tenant       | ❌ Not native                  | `tenants` table — auto-created           |
| Organization | ❌ Not native (no org concept) | `organizations` table — DB-only          |
| Org context  | Custom JWT metadata            | Stored in `auth_organization_identities` |

**Rule**: Same as AuthJS pattern. Supabase has no organization abstraction. DB-only.

### Neon (authjs-drizzle)

| App Level    | Neon Native                        | Our DB                |
| ------------ | ---------------------------------- | --------------------- |
| Tenant       | ❌ Not native (Neon = DB platform) | `tenants` table       |
| Organization | ❌ Not native                      | `organizations` table |

**Rule**: Neon adapter = AuthJS + Drizzle + Neon DB. Org mapping identical to AuthJS. Neon provides no auth primitives — it is a DB, not an auth provider.

---

## Simple App Usage Pattern

For apps that need only one operational level (no enterprise multi-tenancy):

**Provisioning flow on first sign-in:**

```
user signs in → externalOrgId present (Clerk) OR orgId absent (AuthJS/Supabase)
  ↓
1. create/find user
2. auto-create personal/default tenant (1 per user, or 1 shared)
3. auto-create organization under that tenant (named after the user or "Default")
4. create membership (user = owner)
```

**Developer experience**: The developer never interacts with the `tenants` table directly. The provisioning layer handles tenant creation automatically. For simple B2B apps, the organization IS the visible business entity — tenants are infrastructure.

**For Clerk-only simple B2B** (Clerk org = the company account):

- The provisioning layer sees `clerkOrgId` → creates/finds `organizations` → auto-provisions a `tenants` row if none exists for this org's "group"
- For single-org-per-user scenarios: 1 tenant, 1 org, transparent to app code
- The app developer only queries `organizationId` — tenants are invisible

---

## DB Schema Confirmation

The schema defined in `architecture-design.md` Section 2.2 is **APPROVED** with these additions/refinements:

### Confirmed Table Changes

| Change                                                                          | Status      |
| ------------------------------------------------------------------------------- | ----------- |
| `organizations` table added (FK → tenants)                                      | ✅ REQUIRED |
| `auth_tenant_identities` → `auth_organization_identities`                       | ✅ REQUIRED |
| `memberships.tenantId` → `memberships.organizationId`                           | ✅ REQUIRED |
| `roles.tenantId` → `roles.organizationId`                                       | ✅ REQUIRED |
| `policies.tenantId` → `policies.organizationId`                                 | ✅ REQUIRED |
| `invitations` table (token, orgId FK, email, role, expiresAt)                   | ✅ REQUIRED |
| `waitlist_entries` table (email, status, orgId optional)                        | ✅ REQUIRED |
| `RequestIdentitySourceData.tenantExternalId` → `orgExternalId`                  | ✅ REQUIRED |
| `TenantContext` → `OrganizationContext` (adds organizationId, derives tenantId) | ✅ REQUIRED |

### Architecture Rule Additions

1. **Organizations are the RBAC scope** — all role/policy assignments reference `organizationId`
2. **Tenants are the DATA isolation scope** — data queries filter by `tenantId` (via org join when needed)
3. **`auth_organization_identities`** maps `(provider, externalOrgId)` → `organizationId` — one-to-one per provider
4. **Tenant auto-provisioning** — provisioning service creates tenant transparently; apps never call tenant creation directly
5. **Default organization** — every tenant must have at least one organization at all times

---

## Module Boundary Rules

The `organizations` module boundary (from architecture-design.md Section 6):

```
src/modules/
  provisioning/           ← owns: tenant + org + membership creation
  authorization/          ← owns: RBAC (roles, policies) — scoped to organizationId
  organization/           ← NEW: domain entity for organization management
```

**Dependency direction confirmed**:

- `authorization` may import from `organization` (org-scoped RBAC)
- `organization` must NOT import from `authorization`
- `provisioning` orchestrates both — imports from both but is owned only by provisioning
- `auth/infrastructure/*` imports from `provisioning` for identity resolution

---

## Risks and Residual Issues

| Risk                                                         | Severity | Mitigation                                                               |
| ------------------------------------------------------------ | -------- | ------------------------------------------------------------------------ |
| `auth_tenant_identities` rename has wide grep surface        | HIGH     | Phase 1 must include full codebase audit before migration                |
| `ClerkUserRepository` dead code still in codebase            | HIGH     | Phase 4, remove before Phase 1 ships                                     |
| `bootstrap-error.tsx` hard Clerk dependency                  | HIGH     | Phase 4, must use `AUTH_PROVIDER` guard                                  |
| Provisioning tests don't cover two-level flow                | MEDIUM   | Phase 3 validation must add integration tests for create-tenant-then-org |
| AuthJS org switching via JWT re-issue has session complexity | MEDIUM   | Phase 7, design carefully — JWT short-lived or use DB session store      |
| `waitlist/page.tsx` Clerk component import                   | MEDIUM   | Phase 4/6, provider guard required                                       |

---

## Open Questions (Resolved)

1. **Q: Should roles be scoped at org or tenant level?** → **Org level only.** Tenant-level cross-org roles are an enterprise feature (Phase 9+), not in current scope.
2. **Q: How does a user switch between organizations?** → Via org switcher in UI, which calls provisioning to resolve the active org and sets it in session/JWT.
3. **Q: Can a user belong to orgs across different tenants?** → Yes. `memberships` FK is `organizationId`. Two orgs in two different tenants = two membership rows. The user's session has one "active org" at a time.

---

## Verdict

**The two-level `tenants → organizations → memberships` model is APPROVED.**

All 9 phases of the implementation plan may proceed in sequence after user review of this verdict.

The model correctly represents:

- Simple B2B apps (1 tenant, 1 org per user/company) — transparent tenant layer
- Enterprise/platform apps (1 tenant per client, N orgs per tenant) — full hierarchy
- EduGroup → Schools scenario — confirmed correct: EduGroup = DB tenant, School = org + Clerk org

**No architectural redesign needed.** Proceed to Phase 1: DB Schema Restructure.
