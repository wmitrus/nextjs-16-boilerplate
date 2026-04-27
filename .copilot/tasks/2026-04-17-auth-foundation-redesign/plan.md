# Auth Foundation Redesign — Master Plan

## Task ID

`2026-04-17-auth-foundation-redesign`

## Status

**IMPLEMENTATION PHASE** — Phase 0 complete ✅. Phase 1 (DB Schema Restructure) is next.

## Leantime

- Epic Task ID: 55
- Phase 0 Milestone: 45
- Summary Artifact: `11 - Leantime Strategy Agent - Summary.md`

---

## Objective

Redesign the authentication and tenancy foundation of the Next.js 16 boilerplate to:

1. Properly separate **tenants** (isolation boundaries) from **organizations** (operational units)
2. Achieve **full feature parity** across all auth providers (Clerk, AuthJS, Supabase, Neon)
3. Build **provider-agnostic** invitation, waitlist, and registration-mode systems
4. Support **seamless provider switching** via `AUTH_PROVIDER` env + migration script
5. Deliver a **Variant C sample app** (EduGroup → Schools) as proof of correctness
6. Create a **New Provider Implementation Checklist** document
7. Implement a **Leantime Strategy Agent** (Agent 11) for large task orchestration

---

## Prerequisites (Must-Fix Before Any Implementation)

- [x] Architecture design approved — `architecture-design.md` created
- [x] Provider capability matrix approved — `provider-capability-matrix.md` created
- [x] New Provider Implementation Checklist created — `docs/ai/general/new-provider-implementation-checklist.md`
- [x] Agent 11 (Leantime Strategy Agent) spec created — `docs/ai/general/11 - Leantime Strategy Agent.md`
- [x] Leantime project structure created — milestones, goals, blueprints, retros all populated
- [ ] Schema design approved by user (two-level tenant/org model)
- [ ] All specialist agents sign off on design
- [ ] User approves complete plan before Phase 1 starts

---

## Phases

### Phase 0: Design & Architecture Approval ✅ COMPLETE

- [x] Step 0.1: Create architecture design document
- [x] Step 0.2: Create provider capability matrix
- [x] Step 0.3: Create new provider implementation checklist
- [x] Step 0.4: Create Agent 11 — Leantime Strategy Agent spec
- [x] Step 0.5: Set up Leantime project with all features (milestones, goals, blueprints, retros)
- [x] Step 0.5a: Populate all blueprint boards (SWOT, Risks, Lean Canvas, Insights, Value Canvas)
- [x] Step 0.5b: Fix SWOT canvas 500 bug (Canvas.php null data2-data5)
- [x] Step 0.5c: Patch retro items and null-guard all future items
- [x] Step 0.6: **PAUSE — User approval of complete design required** ✅ APPROVED 2026-04-17
- [x] Step 0.7: Create all Leantime implementation tasks (Phases 1–9) ✅ Task IDs 60–68

### Phase 1: DB Schema Restructure (Foundation)

- [x] Step 1.1: Add `organizations` table (FK → tenants)
- [x] Step 1.2: Rename `auth_tenant_identities` → `auth_organization_identities`
- [x] Step 1.3: Change `memberships` FK from `tenant_id` to `organization_id`
- [x] Step 1.4: Change `roles` FK from `tenant_id` to `organization_id`
- [x] Step 1.5: Change `policies` FK from `tenant_id` to `organization_id`
- [x] Step 1.6: Add `invitations` table
- [x] Step 1.7: Add `waitlist_entries` table
- [x] Step 1.8: Write migration script (Drizzle push or custom SQL)
- [x] Step 1.9: Write provider-switching migration helper scripts — DEFERRED to Phase 7 (no second provider yet)
- [x] **Validation**: typecheck 0 errors, lint 0 errors, 1029/1029 unit tests pass, 67/67 db tests pass — dev auth tested manually ✅

### Phase 2: Contract Redesign

- [x] Step 2.1: Update `src/core/contracts/identity.ts` — `orgExternalId` replaces `tenantExternalId`
- [x] Step 2.2: Update `src/core/contracts/tenancy.ts` — `OrganizationContext` with both `organizationId` + `tenantId`
- [x] Step 2.3: Update `src/core/contracts/repositories.ts` — `MembershipRepository` uses `organizationId`
- [x] Step 2.4: Add `OrganizationId` primitive type
- [x] Step 2.5: Update `InternalIdentityLookup` — `findInternalOrganizationId()` replaces `findInternalTenantId()`
- [x] Step 2.6: Update `ProvisioningResult` — `internalOrganizationId` replaces `internalTenantId`
- [x] **Validation**: typecheck passes across all consuming modules

### Phase 3: Provisioning Service Rework

- [x] Step 3.1: Update `ProvisioningService` to create tenant + organization (two-step)
- [x] Step 3.2: Update `DrizzleInternalIdentityLookup` for new org-based lookups
- [x] Step 3.3: Rename/update `OrgDbTenantResolver` → `OrgDbOrganizationResolver`
- [x] Step 3.4: Rename/update `OrgProviderTenantResolver` → `ProviderOrganizationResolver`
- [x] Step 3.5: Update `PersonalTenantResolver` → `PersonalOrganizationResolver`
- [x] Step 3.6: Update all provisioning templates
- [x] **Validation**: unit tests + integration tests for provisioning

### Phase 4: Remove Dead Code + Fix Clerk-specific Coupling

- [x] Step 4.1: Remove `ClerkUserRepository` entirely (never wired, security violation)
- [x] Step 4.2: Fix `bootstrap-error.tsx` — remove `useClerk()` hard dependency
- [x] Step 4.3: Fix `OrganizationSwitcher` — add provider-agnostic placeholder
- [x] Step 4.4: Fix waitlist page — add `AUTH_PROVIDER` guard
- [x] Step 4.5: Audit all `@clerk/nextjs` imports outside Clerk infrastructure
- [x] **Validation**: grep for remaining Clerk-only imports outside clerk/ directory

### Phase 5: Invitation System (Provider-Agnostic)

- [x] Step 5.1: Domain contracts — `InvitationService`, `InvitationRepository`
- [x] Step 5.2: `DrizzleInvitationRepository` implementation
- [x] Step 5.3: `DefaultInvitationService` implementation
- [x] Step 5.4: Invitation token generation (crypto-safe)
- [x] Step 5.5: Route handler: `POST /api/auth/invite`
- [x] Step 5.6: Route handler: `GET /api/auth/invite/[token]` (validate + accept)
- [x] Step 5.7: Email sending abstraction (Resend/SMTP provider-agnostic)
- [x] Step 5.8: Clerk invitation bridge (delegate to Clerk API when `AUTH_PROVIDER=clerk`)
- [x] Step 5.9: UI: Invite member form (organization settings)
- [ ] - [x] **Validation**: unit + integration tests for invitation flow

### Phase 6: Registration Mode + Waitlist (Provider-Agnostic)

- [x] Step 6.1: Add `REGISTRATION_MODE=open|invite-only|disabled` env var
- [x] Step 6.2: Enforce registration mode in proxy.ts (Edge guard)
- [x] Step 6.3: Domain: `WaitlistService`, `WaitlistRepository`
- [x] Step 6.4: `DrizzleWaitlistRepository` implementation
- [x] Step 6.5: Route handler: `POST /api/auth/waitlist` (join waitlist)
- [x] Step 6.6: Custom waitlist page (replaces Clerk Waitlist component)
- [x] Step 6.7: Admin: approve/reject waitlist entries
- [x] Step 6.8: Clerk waitlist bridge (mode=invite-only → Clerk waitlist)
- [ ] **Validation**: E2E tests for registration mode gating

### Phase 7: AuthJS Adapter Implementation

- [x] Step 7.1: Install `next-auth` package
- [x] Step 7.2: Create `src/modules/auth/infrastructure/authjs/auth.config.ts` (Edge-safe)
- [x] Step 7.3: Create `src/modules/auth/infrastructure/authjs/auth.ts` (Node-only)
- [x] Step 7.4: Create `AuthJsRequestIdentitySource` (real implementation)
- [x] Step 7.5: Create `AuthJsEdgeIdentitySource` for proxy.ts
- [x] Step 7.6: Auth.js route handler (`/api/auth/[...nextauth]/route.ts`)
- [x] Step 7.7: `SessionProvider` wrapper component
- [x] Step 7.8: Custom sign-in page (`/auth/signin`)
- [x] Step 7.9: Custom sign-up page (`/auth/signup`)
- [x] Step 7.10: Custom organization switcher (DB-based)
- [x] Step 7.11: Wire into auth module factory
- [x] **Validation**: Full auth flow tests — 1040 unit tests passing, 0 typecheck/lint errors

### Phase 8: Variant C Sample App (EduGroup → Schools)

- [ ] Step 8.1: `src/features/edu-group-sample/` directory structure
- [ ] Step 8.2: EduGroup (tenant) management UI
- [ ] Step 8.3: School (organization) management UI
- [ ] Step 8.4: Teacher/Student membership management
- [ ] Step 8.5: School-level roles (school-admin, teacher, student)
- [ ] Step 8.6: Tenant-level reports (all schools)
- [ ] Step 8.7: School-level reports (one school)
- [ ] Step 8.8: Demo with both Clerk and AuthJS provider
- [ ] **Validation**: E2E tests for EduGroup flows

### Phase 9: Documentation + Finalization

- [ ] Step 9.1: Provider switching guide (step-by-step)
- [ ] Step 9.2: Tenant/Organization model documentation
- [ ] Step 9.3: Update `docs/features/15 - Clerk Authentication.md`
- [ ] Step 9.4: Create `docs/features/29 - AuthJS Authentication.md`
- [ ] Step 9.5: Create `docs/features/30 - Auth Provider Switching.md`
- [ ] Step 9.6: Update AGENTS.md with new tenant/org rules
- [ ] Step 9.7: Log Leantime time and close epic task
- [ ] **Validation**: Documentation review + all Leantime artifacts updated

---

## Must-Fix Before Phase 1 Ships

These are critical structural issues that MUST be resolved before any phase ships to production:

1. `ClerkUserRepository` — remove (dead code + security violation)
2. `bootstrap-error.tsx` — remove `useClerk()` hard dependency
3. `auth_tenant_identities` → `auth_organization_identities` rename
4. `memberships.tenantId` → `memberships.organizationId` FK change
5. `roles.tenantId` → `roles.organizationId` FK change
6. `policies.tenantId` → `policies.organizationId` FK change
7. `waitlist/page.tsx` — provider-agnostic guard required

---

## Pause Points (Explicit)

- **Step 0.6**: ✅ APPROVED 2026-04-17 — Proceeding to Step 0.7
- **After Phase 1**: DB migration tested in local dev environment
- **After Phase 3**: Core provisioning flow tested end-to-end with Clerk
- **After Phase 5**: Invitation flow tested end-to-end
- **After Phase 7**: AuthJS provider switching tested (change env + migration)
- **After Phase 8**: EduGroup sample tested with both providers

---

## Key Design Decisions (Already Made by User)

| Decision                | Choice                                                           |
| ----------------------- | ---------------------------------------------------------------- |
| Tenant/Org model        | Option B — two-level (tenants + organizations)                   |
| Invitation system       | In scope — full DB + email flow                                  |
| Registration mode       | Yes — `REGISTRATION_MODE` env var                                |
| Waitlist                | Custom build (provider-agnostic)                                 |
| ClerkUserRepository     | Remove it + audit all remnants                                   |
| Variant C sample        | Inside repo, easily extractable                                  |
| Provider parity         | Every provider must have all features                            |
| Leantime tracking       | Use ALL features (boards, goals, blueprints, retros, wiki, etc.) |
| Leantime Strategy Agent | Agent 11 — spec created                                          |
