# Production Provisioning Refactor — Implementation Plan

Status: `PR-0 COMPLETE — PR-1 COMPLETE — PR-2 COMPLETE (2nd code-review P1/P2 findings fixed) — PR-3 AWAITING APPROVAL`
Source: `.copilot/2026-03-02-production-provisioning-refactor/PLAN.md` + `IMPLEMENTATION_LOCKED.md`
Execution order: PR-0 → PR-1 → PR-2 → PR-3

---

## Confirmed Decisions

| #   | Decision                                                                                                                                                                            |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I-1 | Dev seed wildcards were a mistake → seed cleaned in PR-3; guard tests target provisioning output only                                                                               |
| I-2 | `ExternalIdentityMapper` split → read-path: `InternalIdentityLookup` (`findInternalUserId`/`findInternalTenantId`, return `string \| null`); write-path: `ProvisioningService` only |
| I-3 | Canonical internal role names: `owner`/`member`; `admin` allowed only as claim alias mapping → `owner`; seed updated in PR-3                                                        |
| I-4 | `AUTH.IDENTITY_SOURCE` already exposed in contracts and registered in `createAuthModule`; `onboarding-actions.ts` will resolve it directly in PR-3                                  |
| I-5 | No conflict; PR-1 resolves via strategy pattern (4 resolver implementations)                                                                                                        |

---

## Codebase Analysis Summary (pre-refactor state)

| File                                                                       | Issue                                                                                                                                          |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/core/contracts/identity.ts` → `RequestIdentitySourceData`             | Has `orgId?` (provider-specific). Must become `tenantExternalId?` + `tenantRole?`                                                              |
| `src/modules/auth/infrastructure/RequestScopedIdentityProvider.ts`         | Calls `resolveOrCreateInternalUserId` — **write-side effect** → must be purified                                                               |
| `src/modules/auth/infrastructure/RequestScopedTenantResolver.ts`           | Calls `resolveOrCreateInternalTenantId` + `ensureTenantAccess` — **write-side effects** → must be purified                                     |
| `src/modules/auth/infrastructure/drizzle/DrizzleExternalIdentityMapper.ts` | `ensureTenantAccess` creates membership + bootstrap role → move to `ProvisioningService`                                                       |
| `src/modules/auth/infrastructure/ExternalIdentityMapper.ts`                | Interface mixes read+write → replace read-path with `InternalIdentityLookup`                                                                   |
| `src/modules/auth/infrastructure/clerk/ClerkRequestIdentitySource.ts`      | Maps `orgId`, not `tenantExternalId`; missing `tenantRole`                                                                                     |
| `src/modules/auth/ui/onboarding-actions.ts`                                | No `ensureProvisioned()` call; uses only internal `identity.id` → fixed in PR-3                                                                |
| `src/core/env.ts`                                                          | Missing: `TENANCY_MODE`, `DEFAULT_TENANT_ID`, `TENANT_CONTEXT_SOURCE`, `TENANT_CONTEXT_HEADER`, `TENANT_CONTEXT_COOKIE`, `FREE_TIER_MAX_USERS` |
| `src/modules/authorization/infrastructure/drizzle/seed.ts`                 | Wildcard policies + `admin` role name → fixed in PR-3                                                                                          |
| `src/modules/authorization/infrastructure/drizzle/schema.ts`               | `tenant_attributes` missing `policy_template_version` column → added in PR-3                                                                   |
| `src/security/actions/secure-action.ts`                                    | Anonymous action strings (`system:execute`) → replaced with catalog constants in PR-1                                                          |
| `src/modules/provisioning/**`                                              | Module does not exist → created in PR-1/PR-2                                                                                                   |

---

## Phase Checklist

### [x] PR-0 — Identity Boundary Fix + Resolver Purity (Blocker)

> **COMPLETE (post code-review fixes applied).** Exit criteria met: typecheck + lint pass, no write-side effects in resolvers.

#### Step 0.1 — Normalize `RequestIdentitySourceData` contract

- [x] `src/core/contracts/identity.ts`: replace `orgId?: string` with `tenantExternalId?: string` and add `tenantRole?: string`
- [x] Add JSDoc invariant comments: `userId/email/tenantExternalId/tenantRole` = external provider claims only
- [x] Add `Identity.id` invariant comment: internal UUID only

#### Step 0.2 — Update Clerk identity source

- [x] `src/modules/auth/infrastructure/clerk/ClerkRequestIdentitySource.ts`: map `orgId` → `tenantExternalId`, extract `tenantRole` from `sessionClaims.org_role` (best-effort, fallback `undefined`)
- [x] `ClerkRequestIdentitySource.test.ts`: add tests for `tenantExternalId` and `tenantRole` extraction

#### Step 0.3 — Update AuthJs + Supabase identity sources

- [x] `AuthJsRequestIdentitySource.ts`: explicitly return `tenantExternalId: undefined`, `tenantRole: undefined`
- [x] `SupabaseRequestIdentitySource.ts`: same
- [x] Update unit tests for both

#### Step 0.4 — Split `ExternalIdentityMapper` into read-only lookup

- [x] New `InternalIdentityLookup` interface: read-only, `findInternalUserId`/`findInternalTenantId` returning `string | null`
- [x] `DrizzleInternalIdentityLookup.ts`: SELECT-only implementation
- [x] `DrizzleExternalIdentityMapper.ts`: deprecated, `ensureTenantAccess` throws → belongs to ProvisioningService
- [x] Update all imports referencing the old interface

#### Step 0.5 — Purify `RequestScopedIdentityProvider`

- [x] Uses `lookup.findInternalUserId()`; if `null` → throws `UserNotProvisionedError`
- [x] `RequestScopedIdentityProvider.test.ts`: regression test — no DB insert called

#### Step 0.6 — Purify `RequestScopedTenantResolver`

- [x] Removed `ensureTenantAccess()` and `resolveOrCreate*` — uses `lookup.findInternalTenantId()`; if `null` → throws `TenantNotProvisionedError`
- [x] `RequestScopedTenantResolver.test.ts`: regression test — no DB inserts

#### Step 0.7 — Add domain errors

- [x] `src/core/contracts/identity.ts`: `UserNotProvisionedError`, `TenantNotProvisionedError`

#### Step 0.8 — Update `createAuthModule` wiring

- [x] `src/modules/auth/index.ts`: passes `DrizzleInternalIdentityLookup` (read-only) to both resolver and provider; no write-capabilities

#### Step 0.9 — Update onboarding trigger guard (prep for PR-3)

- [x] `completeOnboarding()` does NOT silently provision — PR-3 will add the explicit `ensureProvisioned()` call

#### Step 0.10 — Tests + Quality Gates

- [x] Unit: `RequestScopedIdentityProvider` returns internal ID and does not call write-path
- [x] Unit: `RequestScopedTenantResolver` does not call write-path
- [x] Regression: `tenantResolver.resolve()` does not insert into `memberships`/`roles`
- [x] `proxy.ts`: maps Clerk `orgId` → `tenantExternalId` in request identity source
- [x] `SystemIdentitySource.ts`: uses `tenantExternalId` field
- [x] `MissingTenantContextError`: updated message (no `orgId` reference)
- [x] `pnpm typecheck` — PASS
- [x] `pnpm lint` — PASS
- [x] **Code-review P1**: `ensureTenantAccess()` made `async` — Promise contract correct; DB test now passes
- [x] **Code-review P1**: `Identity.id` invariant updated — edge exception documented in comment; fallback path annotated
- [x] **Code-review P1**: `UserNotProvisionedError` handled in `onboarding/layout.tsx`, `onboarding-actions.ts`, `security-context.ts`
- [x] **Code-review P2**: AuthJs/Supabase sources return normalized `{tenantExternalId: undefined, tenantRole: undefined}` instead of throwing; tests updated

---

### [x] PR-1 — Foundations (Config + Contracts + Tenancy Strategy)

> **COMPLETE.** Exit criteria met: typecheck + lint pass, no coupling AUTH_PROVIDER → TENANCY_MODE.

#### Step 1.1 — Env schema extension

- [x] `src/core/env.ts`: add server-side vars:
  - `TENANCY_MODE`: `z.enum(['single', 'personal', 'org']).default('single')`
  - `DEFAULT_TENANT_ID`: `z.uuid().optional()` (required when `TENANCY_MODE=single`)
  - `TENANT_CONTEXT_SOURCE`: `z.enum(['provider', 'db']).optional()` (required when `TENANCY_MODE=org`)
  - `TENANT_CONTEXT_HEADER`: `z.string().default('x-tenant-id')`
  - `TENANT_CONTEXT_COOKIE`: `z.string().default('active_tenant_id')`
  - `FREE_TIER_MAX_USERS`: `z.coerce.number().default(5)`
- [x] Add `runtimeEnv` mappings for all new vars
- [x] `.env.example`: document all new vars
- [x] `src/core/env.test.ts`: test parsing + validation of new vars
- [x] Add cross-field validation: `TENANCY_MODE=org` requires `TENANT_CONTEXT_SOURCE`; exported `validateTenancyConfig()`

#### Step 1.2 — Resources & Actions catalog

- [x] Create `src/core/contracts/resources-actions.ts`:
  - Constants for all resources: `RESOURCES = { ROUTE, USER, TENANT, BILLING, SECURITY, PROVISIONING }`
  - Constants for all actions using `createAction()`: `ACTIONS = { ROUTE_ACCESS, USER_READ, USER_UPDATE, USER_INVITE, USER_DEACTIVATE, TENANT_READ, TENANT_UPDATE, TENANT_MANAGE_MEMBERS, BILLING_READ, BILLING_UPDATE, SECURITY_READ_AUDIT, SECURITY_MANAGE_POLICIES, PROVISIONING_ENSURE }`
  - No wildcard strings
- [x] `src/core/contracts/resources-actions.test.ts`: test all actions pass `isAction()`, no duplicates
- [x] Export from `src/core/contracts/index.ts` (`PROVISIONING` token)

#### Step 1.3 — Tenancy strategy domain types

- [x] Create `src/modules/provisioning/domain/tenancy-mode.ts`: `TenancyMode = 'single' | 'personal' | 'org'`
- [x] Create `src/modules/provisioning/domain/tenant-context-source.ts`: `TenantContextSource = 'provider' | 'db'`

#### Step 1.4 — Tenant resolver strategies

- [x] Create `src/modules/provisioning/infrastructure/SingleTenantResolver.ts`
- [x] Create `src/modules/provisioning/infrastructure/PersonalTenantResolver.ts`
- [x] Create `src/modules/provisioning/infrastructure/OrgProviderTenantResolver.ts`
- [x] Create `src/modules/provisioning/infrastructure/OrgDbTenantResolver.ts`
- [x] Create `src/modules/provisioning/infrastructure/request-context/ActiveTenantContextSource.ts` port
- [x] Create `src/modules/provisioning/infrastructure/request-context/HeaderActiveTenantSource.ts`
- [x] Create `src/modules/provisioning/infrastructure/request-context/CookieActiveTenantSource.ts`
- [x] Create `src/modules/provisioning/infrastructure/request-context/CompositeActiveTenantSource.ts`
- [x] `InternalIdentityLookup` extended with `findPersonalTenantId()`
- [x] `DrizzleInternalIdentityLookup` implements `findPersonalTenantId()` (personal tenant convention)

#### Step 1.5 — Update `createAuthModule` + bootstrap wiring

- [x] `src/core/runtime/bootstrap.ts`: reads tenancy env vars; selects `membershipRepository` for `org/db`; calls `validateTenancyConfig()`
- [x] `src/modules/auth/index.ts`: `AuthModuleConfig` extended; `buildTenantResolver()` switches on `tenancyMode`; `next/headers` used for `org/db` active tenant source
- [x] `src/testing/infrastructure/env.ts`: default test env includes all new tenancy vars

#### Step 1.6 — Tests

- [x] Unit: env parsing and validation (mode/source combinations) — `src/core/env.test.ts`
- [x] Unit: `TENANCY_MODE=org` without `TENANT_CONTEXT_SOURCE` → config error
- [x] Unit: resolver strategies — `SingleTenantResolver`, `PersonalTenantResolver`, `OrgProviderTenantResolver`, `OrgDbTenantResolver`
- [x] Unit: `OrgProviderTenantResolver` without `tenantExternalId` → `MissingTenantContextError`
- [x] Unit: `OrgDbTenantResolver` without active tenant → `MissingTenantContextError`
- [x] Unit: `OrgDbTenantResolver` with tenant but missing membership → `TenantMembershipRequiredError`
- [x] `pnpm typecheck` — PASS
- [x] `pnpm lint` — PASS
- [x] **Code-review P1**: Security boundary error handling — `MissingTenantContextError`/`TenantNotProvisionedError`/`TenantMembershipRequiredError` handled in `security-context.ts`, `with-auth.ts`, `secure-action.ts`
- [x] **Code-review P1**: `buildTenantResolver()` — explicit guard for `TENANCY_MODE=org` without `TENANT_CONTEXT_SOURCE`; explicit switch on `tenantContextSource`; no implicit fallback
- [x] **Code-review P1**: `TENANCY_MODE=single` requires `DEFAULT_TENANT_ID` — enforced in `validateTenancyConfig()`; `.env.example` updated with valid UUID; `testing/infrastructure/env.ts` updated
- [x] **Code-review P2**: Module boundary leak fixed — `ExternalAuthProvider` + `InternalIdentityLookup` moved to `@/core/contracts/identity`; backward-compat re-exports in old locations; provisioning resolvers + `auth/index.ts` updated to import from core contracts
- [x] **Code-review P2**: Missing tests added — `findPersonalTenantId`, `HeaderActiveTenantSource`, `CookieActiveTenantSource`, `CompositeActiveTenantSource`

---

### [x] PR-2 — Provisioning Engine (Transactional + Least Privilege)

> **COMPLETE.** Exit criteria met: `ensureProvisioned()` covers all modes, no wildcard policies, no role escalation. 532 tests pass.

#### Step 2.1 — Domain errors module

- [x] Create `src/modules/provisioning/domain/errors.ts`: `TenantUserLimitReachedError`, `TenantContextRequiredError`, `MissingProvisioningInputError`

#### Step 2.2 — `ProvisioningService` port

- [x] Create `src/modules/provisioning/domain/ProvisioningService.ts`: `ProvisioningInput`, `ProvisioningResult`, `ProvisioningService` interface

#### Step 2.3 — Write-path repositories (provisioning-owned)

- [x] Created all ports in `src/modules/provisioning/domain/repositories/`

#### Step 2.4 — Drizzle implementation

- [x] `DrizzleProvisioningService.ts`: 7-step transaction, all 4 tenancy modes
- [x] `DrizzleProvisioningService.db.test.ts`: integration tests (idempotency, no wildcard, no escalation)

#### Step 2.5 — Simplify `DrizzleExternalIdentityMapper`

- [x] Removed all write-path methods; kept only `resolveInternalUserId` + `resolveInternalTenantId` (SELECT-only)
- [x] Updated test file

#### Step 2.6 — Module wiring

- [x] `src/modules/provisioning/index.ts` created
- [x] `PROVISIONING.SERVICE` registered in `src/core/runtime/bootstrap.ts`

#### Step 2.7 — Tests

- [x] Unit: role mapping `org/provider` claim → internal (`owner`/`member`)
- [x] Unit: free-tier guard (count check before insert)
- [x] Unit: tenant branching per mode
- [x] Unit: `org/db` without membership → `TenantMembershipRequiredError`
- [x] DB integration: idempotent transaction, race-safe insert (unique constraints)
- [x] DB integration: no wildcard policy bootstrap
- [x] DB integration: no role escalation on existing membership
- [x] DB integration: `personal` mode creates exactly one tenant per user
- [x] `pnpm typecheck` — PASS
- [x] `pnpm lint` — PASS
- [x] `pnpm test` — 535 passed (all PR-2 code-review P1/P2 fixes applied + new tests added)
- [x] **Code-review P1**: org/db write side-effects removed — membership check now first, returns early before any writes
- [x] **Code-review P1**: email FK conflict fixed — ON CONFLICT DO UPDATE + .returning() gets actual userId regardless of provider
- [x] **Code-review P1**: free-tier guard made race-safe — SELECT FOR UPDATE on tenant_attributes row serializes concurrent calls
- [x] **Code-review P2**: config leak fixed — freeTierMaxUsers threaded via AppConfig.provisioning instead of reading global env directly
- [x] **Code-review P2**: arch boundary fixed — DrizzleProvisioningService imports only from ./schema (local re-export aggregation file)
- [x] **2nd code-review P1**: Email auto-link security — `emailVerified?: boolean` added to `RequestIdentitySourceData` + `ProvisioningInput`; `CrossProviderLinkingNotAllowedError` added; `CROSS_PROVIDER_EMAIL_LINKING` env var (default: `verified-only`); `resolveOrCreateUser` now checks policy gate explicitly before any cross-provider link
- [x] **2nd code-review P1**: Tenant creation race fixed — deterministic UUID via SHA-256 hash of `(namespace + key)` for personal + org/provider; `ON CONFLICT DO NOTHING` on both `tenants` + `auth_tenant_identities` → no orphaned tenant rows possible
- [x] **2nd code-review P2**: DB tests now assert key invariants — verified email linking returns same `internalUserId`; unverified email throws `CrossProviderLinkingNotAllowedError`; disabled policy blocks even verified email; org/db no-write asserts correct owner role
- [x] `pnpm typecheck` — PASS (539 tests)
- [x] `pnpm lint` — PASS
- [x] `pnpm test` — 539 passed
- [x] **3rd code-review P1**: Race-path policy bypass fixed — else-branch after INSERT ON CONFLICT/re-SELECT now applies same gate (`crossProviderEmailLinking` + `emailVerified`) when `resolved[0].id !== candidateId && isRealEmail`
- [x] **3rd code-review P1**: Legacy tenant mapping compatibility — `resolveOrCreatePersonalTenant` + `resolveOrCreateOrgTenant` now SELECT `auth_tenant_identities` first; return existing (legacy random) UUID immediately if found; deterministic UUID only used for new tenants
- [x] **3rd code-review P2**: DB tests added — legacy personal+org tenant UUID preserved; race-path gate invariant verified (unverified/disabled/verified-allowed scenarios against pre-existing user row)
- [x] `pnpm typecheck` — PASS
- [x] `pnpm lint` — PASS
- [x] `pnpm test` — 544 passed

---

### [ ] PR-3 — Onboarding Integration + Policy Templates Versioning

> **Confirm before starting.** Exit criteria: `completeOnboarding()` provisions first, templates versioned, docs updated.

#### Step 3.1 — Policy templates

- [ ] Create `src/modules/provisioning/policy/templates.ts`:
  - `POLICY_TEMPLATE_VERSION = 1` constant
  - `ownerPolicies`: explicit allow policies using `ACTIONS.*` constants (no wildcard)
  - `memberPolicies`: explicit allow policies with self-access condition `subject.userId == resource.userId` for `user:read` / `user:update`
  - No `resource='*'` or `actions=['*']` entries

#### Step 3.2 — Schema migration for `policy_template_version`

- [ ] Add `policy_template_version` column to `tenant_attributes` table: `integer('policy_template_version').notNull().default(0)`
- [ ] Generate Drizzle migration: `pnpm drizzle-kit generate`
- [ ] Update `TenantAttributes` contract type (add `policyTemplateVersion?: number`)

#### Step 3.3 — Policy versioning in provisioning

- [ ] `DrizzleProvisioningService`: after membership step, check `tenant_attributes.policy_template_version` vs `POLICY_TEMPLATE_VERSION`
- [ ] If stale (version < current): upsert missing policy defaults for `owner` + `member` roles idempotently
- [ ] Persist new version to `tenant_attributes.policy_template_version` after successful apply
- [ ] No privilege creep: only ADD missing policies (never remove or replace existing)

#### Step 3.4 — Update `completeOnboarding()` (provisioning-first)

- [ ] `src/modules/auth/ui/onboarding-actions.ts`:
  1. Resolve `AUTH.IDENTITY_SOURCE` from container → get raw `userId`, `email`, `tenantExternalId`, `tenantRole`
  2. Resolve `PROVISIONING.SERVICE` from container
  3. Call `provisioning.ensureProvisioned({ provider: env.AUTH_PROVIDER, externalUserId, email, tenantExternalId, tenantRole, activeTenantId, tenancyMode: env.TENANCY_MODE, tenantContextSource: env.TENANT_CONTEXT_SOURCE })`
  4. On provisioning failure → return error (no profile update)
  5. On success → existing profile update + onboardingComplete flow unchanged

#### Step 3.5 — Audit event

- [ ] Log structured audit event on `provisioning:ensure` success/failure using existing server logger

#### Step 3.6 — Harden dev seed (Phase F alignment)

- [ ] `src/modules/authorization/infrastructure/drizzle/seed.ts`: replace wildcard policies with explicit `owner`/`member` action lists using `ACTIONS.*` constants
- [ ] Rename seed roles from `admin` → `owner` (aligning with canonical internal names)

#### Step 3.7 — Phase H guardrails

- [ ] `src/modules/provisioning/policy/templates.test.ts`: guard test — no template contains `actions: ['*']` or `resource: '*'`
- [ ] Add test: `ensureProvisioned()` on existing membership with different role claim does not escalate role
- [ ] Run `pnpm skott:check:only` + `pnpm madge` — no circular dependencies

#### Step 3.8 — Tests

- [ ] Integration: `completeOnboarding()` calls `ensureProvisioned()` before profile update
- [ ] Integration: `org/provider` without `tenantExternalId` → controlled failure (no profile update)
- [ ] Integration: `org/db` without `activeTenantId` → controlled failure
- [ ] Integration: `org/db` with active tenant but missing membership → `TenantMembershipRequiredError`
- [ ] Unit: template version bump does not add wildcard policies
- [ ] Run `pnpm typecheck` and `pnpm lint` — must pass

---

## Global Guardrails (verified at each PR)

- [ ] `AUTH_PROVIDER` and `TENANCY_MODE` are orthogonal (no hard-coded coupling)
- [ ] No wildcard default policies (`*`) in provisioning output
- [ ] No silent membership role escalation
- [ ] Edge middleware remains context-only (no DB write)
- [ ] All new code covered by focused tests
- [ ] `pnpm typecheck` + `pnpm lint` pass before phase sign-off

---

## Execution Order

1. **PR-0** (blocker) → confirm → implement → confirm done
2. **PR-1** → confirm → implement → confirm done
3. **PR-2** → confirm → implement → confirm done
4. **PR-3** → confirm → implement → confirm done
