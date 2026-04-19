# New Auth Provider Implementation Checklist

> **Version**: 1.0 — Auth Foundation Redesign (2026-04-17)
> **Owner**: Auth team
> **Purpose**: Ensure every new auth provider achieves full feature parity with all existing providers.

This checklist MUST be completed for every new provider added to the boilerplate. No provider ships without all items checked or explicitly documented as deferred with a plan.

---

## Phase 0: Pre-Implementation Requirements

- [ ] Read `AGENTS.md` — always-applied repository context
- [ ] Read `docs/ai/general/SECURITY_CODING_PATTERNS.md` — all security rules
- [ ] Read `docs/ai/general/AUTH_FLOW_ANTI_PATTERNS.md`
- [ ] Read `.copilot/tasks/2026-04-17-auth-foundation-redesign/architecture-design.md`
- [ ] Read `.copilot/tasks/2026-04-17-auth-foundation-redesign/provider-capability-matrix.md`
- [ ] Read existing provider implementation (Clerk) for pattern reference:
  - `src/modules/auth/infrastructure/clerk/ClerkRequestIdentitySource.ts`
  - `src/modules/auth/edge.ts`
  - `src/modules/auth/index.ts`
- [ ] Verify no existing provider stub exists for this provider
- [ ] Create task directory: `.copilot/tasks/{date}-{provider}-auth-provider/`

---

## Phase 1: Identity Layer

### 1.1 Node-Runtime Identity Source

File: `src/modules/auth/infrastructure/{provider}/{Provider}RequestIdentitySource.ts`

- [ ] Implements `RequestIdentitySource` interface
- [ ] Returns `RequestIdentitySourceData` with correct field mapping:
  - [ ] `userId` → external user ID string (NOT internal UUID)
  - [ ] `email` → email claim from session
  - [ ] `emailVerified` → explicitly `true` only when provider guarantees it
  - [ ] `orgExternalId` → external org/group ID (if provider has org concept)
  - [ ] `orgRole` → role claim from provider session
- [ ] Caches result per request (single `auth()` call per request)
- [ ] Never throws when unauthenticated — returns empty `{}`
- [ ] Structured logging: warn when email claim is missing
- [ ] Follows SEC-10: no raw Error objects in logger calls

### 1.2 Edge-Safe Identity Source

File: `src/modules/auth/infrastructure/{provider}/{Provider}EdgeIdentitySource.ts`

- [ ] Implements `RequestIdentitySource` interface
- [ ] Uses ONLY Edge-compatible APIs (no Node.js built-ins)
- [ ] Can run in `src/proxy.ts` context (Next.js middleware)
- [ ] Returns minimal identity data sufficient for auth presence check
- [ ] Does NOT perform DB lookups (read-only, provider-data-only)
- [ ] Registered in `src/modules/auth/edge.ts` for `authProvider === '{provider}'`

### 1.3 Auth Module Factory Registration

File: `src/modules/auth/index.ts`

- [ ] Case added to `buildIdentitySource()` switch
- [ ] Edge source case added to `src/modules/auth/edge.ts`
- [ ] No Clerk-specific imports outside clerk directory

---

## Phase 2: Session & Token

- [ ] `AUTH_SECRET` or equivalent env var configured (≥32 bytes, cryptographically random)
- [ ] Session strategy decided: JWT vs database (document reason)
- [ ] JWT claims mapped: `userId`, `email`, `emailVerified`, `orgExternalId`, `orgRole`
- [ ] Session refresh/rotation behavior documented
- [ ] Edge-safe session validation (no DB required in middleware)
- [ ] Session does NOT contain internal DB UUIDs (only external provider IDs)
- [ ] CSRF protection in place (provider-handled or framework-level)
- [ ] Secure cookie attributes: `httpOnly`, `sameSite=lax`, `secure` in production

---

## Phase 3: Sign-in / Sign-up UI

### 3.1 Sign-in Page

File: `src/app/auth/signin/page.tsx` (or provider-specific route)

- [ ] Custom sign-in form OR provider-hosted redirect
- [ ] Handles `callbackUrl` correctly (sanitized via `sanitizeRedirectUrl()`)
- [ ] Error states: wrong credentials, account locked, unverified email
- [ ] Accessible (keyboard nav, ARIA labels)
- [ ] Works with `REGISTRATION_MODE` guard

### 3.2 Sign-up Page (If Open Registration)

- [ ] Custom sign-up form OR provider-hosted redirect
- [ ] Respects `REGISTRATION_MODE=open|invite-only|disabled`
- [ ] Shows waitlist form when `REGISTRATION_MODE=invite-only`
- [ ] Shows "registration disabled" message when `REGISTRATION_MODE=disabled`

### 3.3 Session Provider (Client-Side)

- [ ] `SessionProvider` wrapper (or equivalent) in `src/app/layout.tsx`
- [ ] Marked `'use client'` — never imported in server components
- [ ] Compatible with React Compiler (no manual `useMemo`/`useCallback`)

---

## Phase 4: Provisioning Integration

- [ ] `ProvisioningService.ensureProvisioned()` called after sign-in
- [ ] `ProvisioningInput` fields populated from identity source data:
  - [ ] `provider` = `'{provider}'`
  - [ ] `externalUserId` from `RequestIdentitySourceData.userId`
  - [ ] `orgExternalId` from `RequestIdentitySourceData.orgExternalId`
  - [ ] `orgRole` from `RequestIdentitySourceData.orgRole`
- [ ] `DrizzleInternalIdentityLookup.findInternalOrganizationId()` works with provider
- [ ] `auth_user_identities` row created with correct `provider` value
- [ ] `auth_organization_identities` row created with correct `provider` value (if org mode)
- [ ] Provisioning is atomic (single transaction)
- [ ] No identity escalation: existing membership role never upgraded by re-provisioning

---

## Phase 5: Organization Management

> If provider has native org support (e.g., Clerk): use provider API + DB sync.
> If provider has no native org support (e.g., AuthJS): use DB-only implementation.

- [ ] Create organization: `POST /api/orgs` route handler (DB + provider sync)
- [ ] List user organizations: DB query on memberships
- [ ] Switch active organization: custom session update mechanism
  - Clerk: `setActive({ organization })`
  - AuthJS: update JWT custom claim via `session.update()`
  - Other: document provider-specific mechanism
- [ ] Organization switcher UI component: custom or provider-provided
- [ ] Member list: DB memberships query
- [ ] Organization roles: DB roles table (mapped from provider roles if applicable)

---

## Phase 6: Invitation System

- [ ] All invitation operations use `InvitationService` domain contract
- [ ] **Send invitation:**
  - [ ] `POST /api/orgs/{orgId}/invitations` route handler
  - [ ] Generates `crypto.randomBytes(32).toString('hex')` token
  - [ ] Stores in `invitations` table with `expiresAt = NOW() + 7 days`
  - [ ] Sends invitation email via `EmailService`
  - [ ] If provider has native invitation API (Clerk): delegate AND sync to DB
- [ ] **Accept invitation:**
  - [ ] `GET /api/auth/invite/{token}` route handler (validates token)
  - [ ] Token check: not expired, not already accepted, not revoked
  - [ ] After sign-in: marks accepted, calls `ProvisioningService.ensureProvisioned()`
  - [ ] If provider has native flow: bridge between provider and DB
- [ ] **Revoke invitation:** admin can revoke pending invitations
- [ ] **List invitations:** org admins see all pending invitations

---

## Phase 7: Registration Mode

- [ ] `REGISTRATION_MODE` env var read from T3-Env (`src/core/env.ts`)
- [ ] Edge guard in `src/proxy.ts`:
  - `invite-only`: redirect new users to `/auth/invite-required` or `/waitlist`
  - `disabled`: redirect to `/auth/registration-disabled`
- [ ] Route handler guard in `/api/auth/*`:
  - Validates invitation token before allowing account creation (invite-only)
  - Rejects all sign-ups (disabled)
- [ ] UI: sign-up page renders correct state based on mode

---

## Phase 8: Waitlist

- [ ] Custom waitlist page at `/waitlist` (replaces Clerk `<Waitlist>` for non-Clerk)
- [ ] `POST /api/auth/waitlist` route handler
  - Validates email format
  - Checks if email already registered
  - Checks if already on waitlist
  - Inserts into `waitlist_entries` with `status=pending`
- [ ] Admin: `GET /api/admin/waitlist` — list pending entries
- [ ] Admin: `POST /api/admin/waitlist/{id}/approve` — approve → trigger invitation
- [ ] Admin: `POST /api/admin/waitlist/{id}/reject` — reject with optional reason
- [ ] Email notifications: approval notification sent to user

---

## Phase 9: User Management

- [ ] User profile page: display name, email, avatar
- [ ] Change email: verification flow + update `users` table
- [ ] Change password (if credentials-based)
- [ ] Delete account: cascade removal from all tables + provider account deletion
- [ ] Admin user list: search, filter, disable/enable

---

## Phase 10: Security Checklist

- [ ] SEC-02: `new URL('/literal-path', req.url)` used for redirect construction
- [ ] SEC-03: `sanitizeRedirectUrl()` called before forwarding any `redirect_url`
- [ ] SEC-10: No raw Error objects in logger calls
- [ ] SEC-17: `meta.path` passed to `checkRateLimit()`
- [ ] External user IDs never used as internal domain IDs
- [ ] Session tokens do NOT contain sensitive PII beyond what's needed
- [ ] Rate limiting applied to: sign-in, sign-up, invitation acceptance, waitlist join
- [ ] Email verification enforced before organization join (or documented why not)
- [ ] JWT secret is ≥32 bytes random (not hardcoded)
- [ ] No `.env` secrets committed to repository

---

## Phase 11: Tests

### Unit Tests

- [ ] `{Provider}RequestIdentitySource.test.ts` — mock provider, verify claim mapping
- [ ] `{Provider}EdgeIdentitySource.test.ts` — edge-safe, no Node APIs
- [ ] `AuthJsRequestIdentitySource` mapping for custom JWT claims

### Integration Tests (DB-backed)

- [ ] `DrizzleInternalIdentityLookup.db.test.ts` — verify provider → org lookup
- [ ] `ProvisioningService` integration test with provider=`{provider}`
- [ ] Invitation acceptance flow test (token validation + provisioning)
- [ ] Waitlist join → approve → invitation → acceptance flow test

### E2E Tests (Playwright)

- [ ] Sign-in → onboarding → dashboard flow
- [ ] Sign-in with invitation link flow
- [ ] Waitlist join flow (if `REGISTRATION_MODE=invite-only`)
- [ ] Organization switcher (if org mode)
- [ ] Registration disabled page (if `REGISTRATION_MODE=disabled`)

---

## Phase 12: Documentation

- [ ] `docs/features/{N} - {Provider} Authentication.md` created
- [ ] Required env vars documented with example values
- [ ] Supported sign-in methods listed
- [ ] Organization management notes (native vs app-level)
- [ ] Known limitations documented
- [ ] Provider switch TO and FROM this provider documented in `docs/features/30 - Auth Provider Switching.md`
- [ ] Provider added to capability matrix (`provider-capability-matrix.md`)
- [ ] This checklist updated with provider-specific notes if any items differ

---

## Phase 13: Provider Switching Scripts

- [ ] Migration script: `{other-provider} → {this-provider}` implemented in `scripts/auth/`
- [ ] Migration script: `{this-provider} → {other-provider}` implemented
- [ ] Migration tested in local dev environment
- [ ] Migration report generated (counts migrated, skipped, failed)
- [ ] Rollback documented

---

## Final Sign-Off (Required)

Before marking implementation complete, all must pass:

- [ ] `pnpm typecheck` — zero errors
- [ ] `pnpm lint --fix` — zero remaining errors
- [ ] `pnpm test` — all unit tests pass
- [ ] `pnpm test:integration` — all integration tests pass
- [ ] Capability matrix row for this provider is complete (no 📋 stub items)
- [ ] All 'Must-Fix' items in `plan.md` are resolved
- [ ] Architecture Guard agent final review completed
- [ ] Security & Auth agent final review completed

---

## Provider-Specific Notes

### Clerk (Reference Implementation)

- Native organizations: YES
- Native invitations: YES
- Native waitlist: NO (custom waitlist required, Clerk Waitlist component deprecated)
- Registration gating: Via Clerk dashboard + app-level `REGISTRATION_MODE` guard
- Known gaps: No parent-level tenant concept; tenant is app-level only

### AuthJS / next-auth v5

- Native organizations: NO — full app-level implementation required
- Native invitations: NO — full DB + email implementation required
- Native waitlist: NO — custom implementation
- Registration gating: Full app-level `REGISTRATION_MODE` enforcement
- Session strategy: JWT recommended (Edge-compatible); database sessions need extra setup
- Supported providers: GitHub, Google, Discord, Credentials, Email (magic link), + 80+ OAuth

### Supabase (Planned)

- Native organizations: LIMITED (teams feature in newer versions)
- Native invitations: YES (project invites)
- Registration gating: Via Supabase dashboard policies
- Special notes: RLS (Row Level Security) can enforce tenant isolation at DB level

### Neon (Planned)

- Native auth: NONE — Neon is a DB provider, not an auth provider
- Implementation: Use Neon as DB backend + separate auth stack (AuthJS recommended)
- Organizations: Full app-level
- Notes: "Neon auth" in boilerplate likely means "Neon DB + custom auth"
