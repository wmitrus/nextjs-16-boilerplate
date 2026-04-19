# Architecture Design — Two-Level Tenant/Organization Model

## Status: ✅ APPROVED — Architecture Guard Verdict 2026-04-17

## Architecture Guard Final Verdict

**Issued**: 2026-04-17  
**Verdict**: APPROVED — two-level model confirmed correct and complete

### Key Confirmations

1. **`tenants → organizations → memberships` is the correct two-level model** — no redesign needed
2. **Clerk mapping**: `clerkOrgId` → `auth_organization_identities.externalOrgId` → `organizations.id` (NEVER `tenants.id`)
3. **AuthJS/Supabase/Neon**: All DB-only org models — `organizations` table is the single source of truth
4. **Tenant auto-provisioning**: Simple apps never call tenant creation directly — provisioning layer handles it transparently
5. **Simple B2B apps**: 1 tenant + 1 org per company = full boilerplate support, tenant is invisible to app code
6. **EduGroup → Schools**: Confirmed correct — EduGroup = DB tenant, School = org + Clerk org, `clerkOrgId` maps to school org

**Full verdict**: `.copilot/tasks/2026-04-17-auth-foundation-redesign/01 - Architecture Guard - Summary.md`

---

---

## 1. Current State Analysis

### 1.1 Current DB Schema (Single-Level, Conflated)

```
users → memberships → tenants (roles: owner/member)
```

The `tenantsTable` currently serves as an **organization** (operational unit), not a true isolation boundary. The naming is misleading:

- `auth_tenant_identities` maps `clerkOrgId → tenantId` — Clerk orgs are organizations, not tenants
- `memberships.tenantId` — user belongs to org (called "tenant"), not isolation boundary
- `roles.tenantId` — roles scoped to org (called "tenant")
- `policies.tenantId` — policies scoped to org (called "tenant")

### 1.2 Confirmed Issues

1. **Single-level model** — cannot support EduGroup → Schools (Variant C)
2. **Semantic confusion** — `tenants` table behaves like organizations
3. **`ClerkUserRepository`** — dead code, never wired, uses external IDs as domain IDs (security violation)
4. **`bootstrap-error.tsx`** — hard `useClerk()` dependency (breaks non-Clerk providers)
5. **`waitlist/page.tsx`** — hard Clerk component dependency
6. **`OrganizationSwitcher`** — Clerk-specific, no AuthJS equivalent

---

## 2. Target Architecture

### 2.1 Two-Level Model

```
tenants (isolation boundary — EduGroup, Acme Corp)
  └── organizations (operational unit — School A, Engineering Team)
        └── memberships (user ∈ organization with role)
```

**When to use tenants:**

- Data isolation between platform clients
- Separate billing/contract per client
- Enterprise SSO per client
- Central audit across multiple organizations

**When organizations suffice (small/medium apps):**

- User groups within a product
- Teams, workspaces, companies in B2B SaaS
- Single-level membership with roles

**Boilerplate support:** Both models — simple apps use one organization per auto-tenant; enterprise apps use full two-level hierarchy.

### 2.2 New DB Schema

#### Core Tables

```sql
-- UNCHANGED: tenants = top-level isolation boundary
-- REPURPOSED: now truly the "platform client" level (was conflated with org)
tenants (
  id          UUID PK DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  slug        TEXT UNIQUE,          -- optional: URL-friendly identifier
  status      TEXT DEFAULT 'active', -- active | suspended | deleted
  createdAt   TIMESTAMPTZ DEFAULT NOW()
)

-- NEW: organizations = operational business unit under tenant
organizations (
  id            UUID PK DEFAULT gen_random_uuid(),
  tenantId      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  slug          TEXT,               -- tenant-scoped, not globally unique
  status        TEXT DEFAULT 'active',
  createdAt     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tenantId, slug)           -- slug unique within tenant
)

-- CHANGED: memberships now reference organizationId (was tenantId)
memberships (
  userId         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organizationId UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  roleId         UUID NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
  createdAt      TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (userId, organizationId)
)

-- CHANGED: roles now scoped to organizationId (was tenantId)
roles (
  id             UUID PK DEFAULT gen_random_uuid(),
  organizationId UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  isSystem       BOOL NOT NULL DEFAULT FALSE,
  createdAt      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (organizationId, name)
)

-- CHANGED: policies now scoped to organizationId (was tenantId)
policies (
  id             UUID PK DEFAULT gen_random_uuid(),
  organizationId UUID REFERENCES organizations(id) ON DELETE CASCADE,
  roleId         UUID REFERENCES roles(id) ON DELETE CASCADE,
  effect         TEXT NOT NULL,    -- allow | deny
  resource       TEXT NOT NULL,
  actions        JSONB NOT NULL,
  conditions     JSONB NOT NULL DEFAULT '{}',
  createdAt      TIMESTAMPTZ DEFAULT NOW()
)

-- UNCHANGED in concept: tenant attributes for billing/plan (stays at tenant level)
tenant_attributes (
  tenantId         UUID PK REFERENCES tenants(id) ON DELETE CASCADE,
  plan             TEXT NOT NULL DEFAULT 'free',
  contractType     TEXT NOT NULL DEFAULT 'standard',
  features         JSONB NOT NULL DEFAULT '[]',
  maxOrganizations INT NOT NULL DEFAULT 1,   -- NEW: limit on orgs per tenant
  maxUsers         INT NOT NULL DEFAULT 5,   -- total across all orgs in tenant
  createdAt        TIMESTAMPTZ DEFAULT NOW(),
  updatedAt        TIMESTAMPTZ DEFAULT NOW()
)
```

#### Auth Identity Tables

```sql
-- UNCHANGED: user identity mapping (external → internal)
auth_user_identities (
  provider       TEXT NOT NULL,
  externalUserId TEXT NOT NULL,
  userId         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  createdAt      TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (provider, externalUserId)
)

-- RENAMED + REPURPOSED: auth_tenant_identities → auth_organization_identities
-- Maps external provider org ID → internal organization (not tenant)
auth_organization_identities (
  provider        TEXT NOT NULL,
  externalOrgId   TEXT NOT NULL,    -- renamed from externalTenantId
  organizationId  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  createdAt       TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (provider, externalOrgId)
)
```

#### New Feature Tables

```sql
-- NEW: Invitation system (provider-agnostic)
invitations (
  id               UUID PK DEFAULT gen_random_uuid(),
  organizationId   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  invitedByUserId  UUID REFERENCES users(id) ON DELETE SET NULL,
  email            TEXT NOT NULL,
  roleId           UUID NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
  token            TEXT NOT NULL UNIQUE,     -- cryptographically random, 32 bytes
  status           TEXT NOT NULL DEFAULT 'pending',  -- pending|accepted|revoked|expired
  expiresAt        TIMESTAMPTZ NOT NULL,
  acceptedAt       TIMESTAMPTZ,
  createdAt        TIMESTAMPTZ DEFAULT NOW()
)

-- NEW: Waitlist (provider-agnostic, replaces Clerk Waitlist component)
waitlist_entries (
  id             UUID PK DEFAULT gen_random_uuid(),
  email          TEXT NOT NULL UNIQUE,
  name           TEXT,
  organizationId UUID REFERENCES organizations(id) ON DELETE SET NULL,  -- target org if invite-only org flow
  tenantId       UUID REFERENCES tenants(id) ON DELETE SET NULL,        -- target tenant if tenant-gated
  status         TEXT NOT NULL DEFAULT 'pending',  -- pending|approved|rejected
  approvedAt     TIMESTAMPTZ,
  notifiedAt     TIMESTAMPTZ,
  createdAt      TIMESTAMPTZ DEFAULT NOW()
)
```

---

## 3. Contract Redesign

### 3.1 `src/core/contracts/identity.ts` Changes

```typescript
// RENAMED: tenantExternalId → orgExternalId
// Reason: Clerk's orgId maps to organization (operational unit), not isolation tenant
export interface RequestIdentitySourceData {
  readonly userId?: string;
  readonly email?: string;
  readonly emailVerified?: boolean;
  readonly orgExternalId?: string; // ← RENAMED from tenantExternalId
  readonly orgRole?: string; // ← RENAMED from tenantRole
}

// RENAMED: findInternalTenantId → findInternalOrganizationId
// NEW: findTenantIdForOrganization
export interface InternalIdentityLookup {
  findInternalUserId(
    provider: ExternalAuthProvider,
    externalUserId: string,
  ): Promise<string | null>;

  findInternalOrganizationId( // ← RENAMED
    provider: ExternalAuthProvider,
    externalOrgId: string, // ← was externalTenantId
  ): Promise<string | null>;

  findTenantIdForOrganization( // ← NEW: derive tenant from org
    organizationId: string,
  ): Promise<string | null>;

  findPersonalOrganizationId( // ← RENAMED from findPersonalTenantId
    internalUserId: string,
  ): Promise<string | null>;
}
```

### 3.2 `src/core/contracts/tenancy.ts` Changes

```typescript
// RENAMED: TenantContext → OrganizationContext
// Now carries both organizationId AND tenantId (derived from org)
export interface OrganizationContext {
  readonly organizationId: OrganizationId;  // ← NEW primary scope
  readonly tenantId: TenantId;              // ← derived from org.tenantId
  readonly userId: SubjectId;
}

// RENAMED: TenantResolver → OrganizationResolver
export interface OrganizationResolver {
  resolve(identity: Identity): Promise<OrganizationContext>;
}

// Keep legacy error classes but align names:
export class OrganizationNotProvisionedError extends Error { ... }
export class MissingOrganizationContextError extends Error { ... }
export class OrganizationMembershipRequiredError extends Error { ... }
```

### 3.3 `src/core/contracts/repositories.ts` Changes

```typescript
// MembershipRepository: organizationId replaces tenantId
export interface MembershipRepository {
  isMember(
    subjectId: SubjectId,
    organizationId: OrganizationId,
  ): Promise<boolean>;
}

// RoleRepository: organizationId replaces tenantId
export interface RoleRepository {
  getRoles(
    subjectId: SubjectId,
    organizationId: OrganizationId,
  ): Promise<RoleId[]>;
}
```

### 3.4 New Primitive Types

```typescript
// src/core/contracts/primitives.ts
export type TenantId = string & { readonly _brand: 'TenantId' };
export type OrganizationId = string & { readonly _brand: 'OrganizationId' }; // ← NEW
export type SubjectId = string & { readonly _brand: 'SubjectId' };
export type RoleId = string & { readonly _brand: 'RoleId' };
```

### 3.5 `src/modules/provisioning/domain/ProvisioningService.ts` Changes

```typescript
export interface ProvisioningInput {
  readonly provider: ExternalAuthProvider;
  readonly externalUserId: string;
  readonly email?: string;
  readonly emailVerified?: boolean;
  readonly orgExternalId?: string; // ← RENAMED from tenantExternalId
  readonly orgRole?: string; // ← RENAMED from tenantRole
  readonly activeOrganizationId?: string; // ← RENAMED from activeTenantId
  readonly tenancyMode: TenancyMode;
  readonly tenantContextSource?: TenantContextSource;
}

export interface ProvisioningResult {
  readonly internalUserId: string;
  readonly internalOrganizationId: string; // ← RENAMED from internalTenantId
  readonly internalTenantId: string; // ← NEW: derived from org
  readonly membershipRole: 'owner' | 'member';
  readonly organizationCreatedNow: boolean; // ← RENAMED from tenantCreatedNow
  readonly tenantCreatedNow: boolean; // ← NEW: was tenant itself created?
  readonly userCreatedNow: boolean;
}
```

---

## 4. New Feature Contracts

### 4.1 Invitation System

```typescript
// src/core/contracts/invitation.ts
export type InvitationStatus = 'pending' | 'accepted' | 'revoked' | 'expired';

export interface Invitation {
  readonly id: string;
  readonly organizationId: OrganizationId;
  readonly invitedByUserId?: SubjectId;
  readonly email: string;
  readonly roleId: RoleId;
  readonly token: string;
  readonly status: InvitationStatus;
  readonly expiresAt: Date;
  readonly acceptedAt?: Date;
  readonly createdAt: Date;
}

export interface InvitationRepository {
  create(invitation: Omit<Invitation, 'id' | 'createdAt'>): Promise<Invitation>;
  findByToken(token: string): Promise<Invitation | null>;
  findByOrganization(organizationId: OrganizationId): Promise<Invitation[]>;
  revoke(id: string): Promise<void>;
  markAccepted(id: string): Promise<void>;
}

export interface InvitationService {
  invite(input: InviteInput): Promise<Invitation>;
  accept(token: string, userId: SubjectId): Promise<void>;
  revoke(id: string): Promise<void>;
  listForOrganization(organizationId: OrganizationId): Promise<Invitation[]>;
}
```

### 4.2 Waitlist System

```typescript
// src/core/contracts/waitlist.ts
export type WaitlistStatus = 'pending' | 'approved' | 'rejected';

export interface WaitlistEntry {
  readonly id: string;
  readonly email: string;
  readonly name?: string;
  readonly organizationId?: OrganizationId;
  readonly tenantId?: TenantId;
  readonly status: WaitlistStatus;
  readonly approvedAt?: Date;
  readonly notifiedAt?: Date;
  readonly createdAt: Date;
}

export interface WaitlistRepository {
  add(entry: Omit<WaitlistEntry, 'id' | 'createdAt'>): Promise<WaitlistEntry>;
  findByEmail(email: string): Promise<WaitlistEntry | null>;
  approve(id: string): Promise<void>;
  reject(id: string): Promise<void>;
  listPending(): Promise<WaitlistEntry[]>;
}

export interface WaitlistService {
  join(input: WaitlistJoinInput): Promise<WaitlistEntry>;
  approve(id: string): Promise<void>; // triggers invitation email
  reject(id: string): Promise<void>;
  getStatus(email: string): Promise<WaitlistStatus | null>;
}
```

---

## 5. Environment Variables

### New Variables

```bash
# Registration mode — controls who can sign up
REGISTRATION_MODE=open          # anyone can register (default for dev)
REGISTRATION_MODE=invite-only   # only invited users can register
REGISTRATION_MODE=disabled      # no new sign-ups (admin manages users)

# Email provider for invitation/waitlist emails
EMAIL_PROVIDER=resend           # resend | smtp | ses | none
EMAIL_FROM=noreply@example.com
RESEND_API_KEY=...              # if EMAIL_PROVIDER=resend
SMTP_HOST=...                   # if EMAIL_PROVIDER=smtp
SMTP_PORT=587
SMTP_USER=...
SMTP_PASSWORD=...
```

### Changed Semantics (Existing Variables)

- `TENANCY_MODE=single|personal|org` — unchanged semantics
- `TENANT_CONTEXT_SOURCE=provider|db` — unchanged semantics (but now resolves `organizationId`)
- `DEFAULT_TENANT_ID` — still used for `TENANCY_MODE=single`, refers to default tenant

---

## 6. Module Structure Changes

### Current Module Structure

```
src/modules/
  auth/
    infrastructure/
      authjs/          ← stub
      clerk/
      drizzle/
      neon/            ← stub
      supabase/        ← stub
      system/
  authorization/
    infrastructure/drizzle/
  provisioning/
    domain/
    infrastructure/
      drizzle/
      request-context/
  user/
```

### Target Module Structure

```
src/modules/
  auth/
    infrastructure/
      authjs/          ← real implementation
      clerk/
      drizzle/
      neon/            ← stub (with checklist note)
      supabase/        ← stub (with checklist note)
      system/
  authorization/
    infrastructure/drizzle/   ← updated for organizationId
  provisioning/
    domain/
      ProvisioningService.ts  ← updated
      InvitationService.ts    ← NEW
      WaitlistService.ts      ← NEW
    infrastructure/
      drizzle/              ← updated for org model
        DrizzleInvitationRepository.ts  ← NEW
        DrizzleWaitlistRepository.ts    ← NEW
      request-context/
  organization/             ← NEW module (or extended from provisioning)
    domain/                 ← Organization entity + OrganizationRepository
    infrastructure/drizzle/ ← DrizzleOrganizationRepository
  user/
```

---

## 7. Provisioning Flow — Updated Two-Level Model

### Current Flow (Single-Level)

```
ClerkAuth → externalUserId + externalTenantId → lookup/create user, tenant, membership
```

### New Flow (Two-Level)

```
AuthProvider → externalUserId + externalOrgId → lookup/create:
  1. user (users table + auth_user_identities)
  2. tenant (tenants table — the isolation boundary)
     - For Clerk: tenant is app-level, created separately (no Clerk equivalent)
     - For simple mode: auto-create tenant if orgExternalId present but no tenant
  3. organization (organizations table + auth_organization_identities)
     - Maps externalOrgId → organizationId
  4. membership (user ∈ organization with role)
  5. roles + policies (seeded from templates, scoped to organization)
```

### Personal Mode (Updated)

```
AuthProvider → externalUserId → lookup/create:
  1. user
  2. personal tenant (auto-created, user owns it)
  3. personal organization (auto-created under personal tenant)
  4. membership (user = owner of personal org)
```

### Single Mode (Updated)

```
AuthProvider → externalUserId → DEFAULT_TENANT_ID → lookup/create:
  1. user
  2. FIXED tenant (DEFAULT_TENANT_ID — must exist)
  3. FIXED organization (DEFAULT_ORG_ID — auto-created under default tenant, or from env)
  4. membership (user = member of default org)
```

---

## 8. Clerk Integration (Unchanged + Extended)

Clerk's flat organization model maps cleanly:

- `Clerk Organization` → `organizations` table (NOT tenants)
- `Clerk orgId` → `auth_organization_identities.externalOrgId`
- `Clerk orgRole` → maps to internal role
- `clerkClient.organizations.createOrganization()` → creates Clerk org + syncs to DB

The `tenants` table (top-level) for Clerk-based apps:

- Auto-created when first organization is provisioned
- For enterprise: pre-created by platform admin
- No native Clerk equivalent for this level

---

## 9. AuthJS Integration (New — Org via DB Only)

AuthJS has NO native organization concept. Everything is DB-only:

- Organizations, memberships, roles, policies — all in our DB
- `orgExternalId` = custom JWT claim (set by app after user selects org)
- `orgRole` = custom JWT claim
- Organization switcher = DB query → update session

---

## 10. Provider Switching

### What "Switching Providers" Means

Changing `AUTH_PROVIDER=clerk` to `AUTH_PROVIDER=authjs`:

1. Auth identity records change: users get new `auth_user_identities` rows (`authjs` provider)
2. Organization identity records change: `auth_organization_identities` rows change provider
3. User sessions change: Clerk sessions invalidated, AuthJS sessions take over
4. Email/password added: AuthJS needs credentials stored (or OAuth configured)

### Migration Script Requirements

```bash
# Provider switch: clerk → authjs
pnpm auth:migrate-provider --from=clerk --to=authjs

# Steps performed:
# 1. Read all auth_user_identities (provider=clerk)
# 2. For each Clerk user → fetch email from DB users table
# 3. Create authjs user record (if email-based) or note OAuth reclaim required
# 4. Insert auth_user_identities rows (provider=authjs, externalUserId=email or oauth-sub)
# 5. Read all auth_organization_identities (provider=clerk)
# 6. Create auth_organization_identities (provider=authjs, externalOrgId=organizationId for DB-mode)
# 7. Log migration report
```

---

## 11. Variant C Sample App (EduGroup → Schools)

### Location

`src/features/edu-group-sample/` — self-contained, easily extracted

### Structure

```
src/features/edu-group-sample/
  domain/
    EduGroupTenantService.ts     ← tenant-level operations
    SchoolOrganizationService.ts ← org-level operations
  ui/
    TenantDashboard.tsx          ← EduGroup admin view (all schools)
    SchoolDashboard.tsx          ← School admin view (one school)
    StudentList.tsx
    TeacherList.tsx
  api/
    route handlers for school management
  seed/
    seed-edu-group.ts            ← seed EduGroup + Schools + users
```

### Demonstrates

- Creating a tenant (EduGroup)
- Creating organizations (Schools) under tenant
- Inviting teachers (invitation flow)
- Student enrollment
- Tenant-level reporting (all schools)
- Organization-level reporting (one school)
- Works with BOTH `AUTH_PROVIDER=clerk` and `AUTH_PROVIDER=authjs`

---

## 12. Key Design Invariants (Must Be Preserved)

1. **Read paths never auto-create** — resolvers return null/throw, never INSERT
2. **Write paths are transactional** — provisioning is atomic
3. **No external IDs as domain IDs** — Clerk orgId is NEVER used as organizationId
4. **Organization scope = authorization scope** — all RBAC decisions use organizationId
5. **Tenant scope = isolation scope** — data queries can be filtered by tenantId via org
6. **Provider-agnostic contracts** — no Clerk imports outside `auth/infrastructure/clerk/`
7. **Edge-safe adapters** — all edge code must not use Node-only APIs
8. **`await connection()` before any DI calls** — RSC prerender constraint
