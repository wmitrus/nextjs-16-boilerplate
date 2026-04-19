# Final Architecture Verdict — Auth Tenant/Organization Model

**Issued**: 2026-04-17  
**Authority**: Architecture Guard (Agent 01) + Research synthesis from `docs/other/orgs-and-clerk.md`  
**Status**: ✅ FINAL — No further redesign needed. Phase 1 may proceed.

---

## The One Truth

> **A tenant is an isolation boundary. An organization is an operational unit. They are different things. Clerk only natively supports organizations — the tenant level must always be built in your DB.**

This is the foundation. Everything below follows from it.

---

## What Clerk Actually Supports

| Clerk Native Concept            | Maps To Our Model                            | Notes                                                            |
| ------------------------------- | -------------------------------------------- | ---------------------------------------------------------------- |
| Clerk Organization              | `organizations` table                        | ✅ operational unit — teams, companies, schools                  |
| Clerk `orgId`                   | `auth_organization_identities.externalOrgId` | NEVER `tenants.id`                                               |
| Clerk Membership                | `memberships` table (via org)                | ✅ user ∈ org with role                                          |
| Clerk Roles/Permissions         | `roles` + `policies` tables (org-scoped)     | ✅ mapped at provisioning                                        |
| Clerk Invitations               | DB `invitations` table + Clerk bridge        | Clerk handles email; we mirror state                             |
| Clerk Waitlist                  | DB `waitlist_entries` + Clerk bridge         | Our table is source of truth                                     |
| **Tenant (isolation boundary)** | **❌ Clerk does NOT support natively**       | Must be our DB entity                                            |
| **Parent org / nested orgs**    | **❌ Not in Clerk docs**                     | Flat org model only                                              |
| **Platforms scenario**          | **❌ Explicitly unsupported by Clerk today** | Isolated user pools, custom domains per customer — not available |

**Consequence**: If you need EduGroup → Schools (or any hierarchy), EduGroup MUST be your own DB entity. It has no Clerk native equivalent. Clerk `orgId` maps only to a School, not to an EduGroup.

---

## The Two-Level Model — FINAL DECISION

```
tenants           (isolation boundary — EduGroup, Acme Corp, "Platform Client")
  └── organizations  (operational unit — School A, Engineering Team, "Workspace")
        └── memberships  (user ∈ org, with role)
```

### Why Two Levels (Not One)

| Requirement                               | One Level Sufficient? | Why Two Levels Needed                                      |
| ----------------------------------------- | --------------------- | ---------------------------------------------------------- |
| Simple B2B SaaS (teams in a product)      | ✅ Yes                | One org per auto-tenant — tenant invisible                 |
| EduGroup → Multiple Schools               | ❌ No                 | Schools are orgs; EduGroup is a tenant                     |
| Enterprise with multiple divisions        | ❌ No                 | Division = org; Corporation = tenant                       |
| Data isolation per client                 | ❌ No                 | Isolation belongs at tenant, not org level                 |
| Billing per platform client               | ❌ No                 | `tenant_attributes` holds plan/billing                     |
| Provider switching without data migration | ❌ No                 | `auth_organization_identities` table requires org-level FK |

### Simple App Pattern (One Level in Practice)

Simple apps don't interact with tenants at all. The provisioning layer auto-creates a tenant silently:

```
user signs in (Clerk) → orgId present
  → find or create organizations row (via auth_organization_identities)
  → if no tenant exists for this org: auto-create tenant (1 per Clerk app, or 1 per org depending on config)
  → create membership
  → app code only queries organizationId — never touches tenants
```

Tenant is infrastructure, invisible to app developers.

---

## Provider Mapping — FINAL RULES

### Clerk

```
clerkOrgId  →  auth_organization_identities.externalOrgId  →  organizations.id
                                                              NEVER tenants.id
```

Tenant auto-provisioned by the provisioning service. App never calls it.

### AuthJS (next-auth v5)

AuthJS has no native org concept. DB-only:

```
JWT custom claim (orgId)  →  organizations.id (chosen by user or default)
auth_organization_identities.externalOrgId = organizations.id  (self-referential)
```

Org switching: update session → re-issue JWT with new `orgId` claim.

### Supabase Auth

Same as AuthJS. Supabase has no org abstraction:

```
Custom JWT metadata (orgId)  →  organizations.id
auth_organization_identities.externalOrgId = organizations.id
```

### Neon (authjs-drizzle)

Neon is a database platform, not an auth provider. Its adapter = AuthJS + Drizzle:

```
Same as AuthJS mapping
```

---

## EduGroup → Schools — FINAL CONFIRMATION

```
EduGroup (DB entity)  →  tenants table
  └── School A         →  organizations table (+ Clerk org + auth_organization_identities)
  └── School B         →  organizations table (+ Clerk org + auth_organization_identities)
  └── School C         →  organizations table (+ Clerk org + auth_organization_identities)
```

- `clerkOrgId` for School A maps to `organizations.id` for School A ✅
- EduGroup exists only in `tenants` table — no Clerk equivalent needed ✅
- Teachers/Students join a School (org) via `memberships` ✅
- Tenant-level reports query across all orgs in a tenant ✅
- Org-level reports (one school) query by `organizationId` ✅

---

## DB Schema — FINAL CONFIRMED CHANGES

| Table                                         | Change                                                         | Status   |
| --------------------------------------------- | -------------------------------------------------------------- | -------- |
| `organizations`                               | **NEW** — UUID PK, `tenantId` FK, `name`, `slug`, `status`     | REQUIRED |
| `auth_tenant_identities`                      | **RENAMED** → `auth_organization_identities`                   | REQUIRED |
| `auth_organization_identities.externalOrgId`  | Renamed from `externalTenantId`                                | REQUIRED |
| `auth_organization_identities.organizationId` | FK → organizations (was tenantId → tenants)                    | REQUIRED |
| `memberships.organizationId`                  | Replaces `tenantId` — FK → organizations                       | REQUIRED |
| `memberships.tenantId`                        | **REMOVED**                                                    | REQUIRED |
| `roles.organizationId`                        | Replaces `tenantId` — FK → organizations                       | REQUIRED |
| `roles.tenantId`                              | **REMOVED**                                                    | REQUIRED |
| `policies.organizationId`                     | Replaces `tenantId` — FK → organizations                       | REQUIRED |
| `policies.tenantId`                           | **REMOVED**                                                    | REQUIRED |
| `tenant_attributes.maxOrganizations`          | **NEW column**                                                 | REQUIRED |
| `invitations`                                 | **NEW TABLE** — org-scoped, token, email, role, status, expiry | REQUIRED |
| `waitlist_entries`                            | **NEW TABLE** — email, orgId (optional), status                | REQUIRED |

Full DDL: `architecture-design.md` Section 2.2.

---

## Contract Changes — FINAL CONFIRMED

| Contract                                        | Change                                                                                           |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `RequestIdentitySourceData.tenantExternalId`    | → `orgExternalId`                                                                                |
| `TenantContext`                                 | → `OrganizationContext` — carries both `organizationId` + `tenantId` (tenantId derived via join) |
| `MembershipRepository`                          | All methods take `organizationId` (not `tenantId`)                                               |
| `InternalIdentityLookup.findInternalTenantId()` | → `findInternalOrganizationId()`                                                                 |
| `ProvisioningResult.internalTenantId`           | → `internalOrganizationId`                                                                       |
| New: `OrganizationId` branded type              | Distinct from `TenantId` — prevents mixing                                                       |

---

## Code Removals — NON-NEGOTIABLE

These MUST be removed before Phase 1 ships:

| Item                                                                         | Reason                                                                  |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `ClerkUserRepository`                                                        | Dead code, never wired, uses external IDs as domain IDs (SEC violation) |
| `useClerk()` in `bootstrap-error.tsx`                                        | Hard Clerk dependency breaks AuthJS/Supabase providers                  |
| Clerk `Waitlist` component in `waitlist/page.tsx`                            | Must use provider-agnostic custom waitlist                              |
| `OrganizationSwitcher` Clerk component                                       | Must be replaced with provider-agnostic switcher                        |
| All `@clerk/nextjs` imports outside `src/modules/auth/infrastructure/clerk/` | Module boundary violation                                               |

---

## Module Boundaries — FINAL

```
src/modules/
  provisioning/       ← owns: tenant + org + membership creation, identity resolution
  authorization/      ← owns: RBAC (roles, policies), scoped to organizationId
  organization/       ← NEW: org domain entity, CRUD, slug, status
  auth/
    infrastructure/
      clerk/          ← all @clerk/nextjs imports confined here
      authjs/         ← all next-auth imports confined here (Phase 7)
      supabase/       ← all @supabase/ssr imports confined here (future)
```

**Dependency rules**:

- `authorization` imports from `organization` (org-scoped RBAC) ✅
- `organization` must NOT import from `authorization` ❌
- `provisioning` orchestrates both ✅
- `auth/infrastructure/clerk/*` imports from `provisioning` only ✅

---

## Implementation Plan — Phase Sequence

| Phase | What                                                       | Blocks              |
| ----- | ---------------------------------------------------------- | ------------------- |
| **1** | DB schema — add organizations, rename tables, drop old FKs | Everything else     |
| **2** | Contract redesign — update TypeScript interfaces/types     | Provisioning + auth |
| **3** | Provisioning service — two-step create (tenant → org)      | Auth flows          |
| **4** | Remove dead code — ClerkUserRepository, Clerk-only UI      | Provider parity     |
| **5** | Invitation system — provider-agnostic DB flow              | Phase 7 (AuthJS)    |
| **6** | Registration mode + waitlist — provider-agnostic           | Phase 7             |
| **7** | AuthJS adapter — full implementation                       | Phase 8             |
| **8** | EduGroup → Schools sample feature                          | All of above        |
| **9** | Documentation + finalization                               | All of above        |

**Phase 1 and 2 must complete before Phase 3 can start.**  
**Phases 5 and 6 can run in parallel after Phase 3 completes.**  
**Phase 7 requires Phases 1–6 complete.**  
**Phase 8 requires Phase 7 complete.**

---

## Retrospectives — Milestone Linking Policy

**Decided**: Only `startdoing` retro items get milestone links.

- `well` / `notwell` items are observations — no milestone link needed.
- `startdoing` items are actionable commitments → link to the phase milestone they belong to.
- Two retro items (IDs 33, 34) already linked to Phase 0 milestone (ID 45).

Catalog operation: `retrospectives.milestone.link-existing` (available in `scripts/leantime/catalog.ts`).

---

## Leantime Project State

| Board/Artifact        | ID  | Status                         |
| --------------------- | --- | ------------------------------ |
| Epic Task             | 55  | W toku                         |
| Phase 0 Milestone     | 45  | Active                         |
| Goal Board            | 16  | 6 goals (IDs 17–22)            |
| SWOT Canvas           | 17  | ✅ 5 items — 500 FIXED         |
| Risk Analysis         | 18  | ✅ 5 items — 500 FIXED         |
| Lean Canvas           | 19  | ✅ 12 items                    |
| Insights              | 20  | ✅ 5 items — 500 FIXED         |
| Value Canvas          | 21  | ✅ 4 items                     |
| Business Model Canvas | 23  | ✅ 9 items                     |
| Retrospective         | 22  | 7 items, 2 linked to milestone |

**500 error root cause fixed**: Items in boards with non-empty `relatesLabels` (SWOT, Risks, Insights inherit the parent `Canvas.php` default) had `relates = NULL`. Template crashed on `$relatesLabels[$row['relates']]`. Fixed by setting `relates = 'relates_none'` for all 15 affected items + patching plugin `normalizeItemPayload()` to default `relates` to first valid key (like `status` already does).

---

## Next Step

**Step 0.6 — User Approval**: This document constitutes the final design. Once approved, proceed to:

- Step 0.7: Create all Phase 1–9 Leantime tasks
- Phase 1 implementation begins
