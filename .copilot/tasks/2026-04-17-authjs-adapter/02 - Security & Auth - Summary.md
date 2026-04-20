# Security & Auth — AuthJS Pre-Implementation Analysis

## Agent Role

02 - Security & Auth

## Task

Security and auth analysis of the current Clerk implementation gaps and constraints that affect the AuthJS adapter design and tenant/organization model.

## Status: BLOCKING ISSUES IDENTIFIED — Must Resolve Before Implementation

---

## PART 1: Clerk Features Audit — Security-Critical Gaps

### 1.1 ClerkUserRepository Uses External ID as Internal ID (Critical Finding)

```typescript
// src/modules/auth/infrastructure/ClerkUserRepository.ts
async findById(userId: SubjectId): Promise<User | null> {
  const client = await clerkClient();
  const user = await client.users.getUser(userId); // userId = Clerk external ID (user_xxx)
  return { id: user.id, ... }; // returns Clerk ID, not internal UUID
}
```

**This violates the core security invariant** from `docs/feature-desings/01 - Final Auth...`:

> External provider identifiers must never be used as domain user IDs in Node paths.

`ClerkUserRepository.findById()` is called with an external Clerk `user_xxx` ID and returns the Clerk user object with `id: user.id` (still the external Clerk ID). If this were wired into the DI container, downstream authorization using `user.id` from this repo would be using external IDs — a critical security violation.

**Current mitigation:** `ClerkUserRepository` is NOT wired — `DrizzleUserRepository` is used instead. The Clerk repo is dead code. This is the correct state — remove the dead code to prevent accidental future wiring.

**Action:** Remove `ClerkUserRepository.ts` or add a top-level comment marking it as `@deprecated — DO NOT WIRE — violates external-ID-as-domain-ID invariant`.

### 1.2 Invitation System: Policy Action Exists Without Enforcement Implementation

The `USER_INVITE` action is in `ownerPolicies` — owners are authorized to invite users. But:

- No invitation table exists in the DB
- No invitation service exists
- No invitation API endpoint exists
- No invitation email flow exists
- **Clerk handles invitations via its own dashboard API (`inviteUserToOrganization`)**

**Security implication:** The `USER_INVITE` authorization policy is a permission that can be checked but leads to no implementation. In Clerk mode, invitations bypass the DB entirely (Clerk dashboard → Clerk email → Clerk sign-up → app bootstrap). For AuthJS, this path would not exist — invitations must be implemented at the DB level.

**Gap:** If an authorized user calls a "send invitation" action that doesn't exist yet, authorization passes but no invitation is sent. This is a UI/product gap, not a security gap, but it means the boilerplate's stated capability (owners can invite users) is not actually implemented.

### 1.3 Registration Restriction: No Enforcement Layer

The waitlist page uses `<Waitlist>` from Clerk. Clerk allows administrators to restrict sign-up in the dashboard. But:

- There is NO application-level registration gate
- If `AUTH_PROVIDER=authjs`, ANY user who can reach `/api/auth/signin` can sign up (if Credentials or open OAuth is configured)
- There is no "invite-only" mode implemented in the app layer

**Required for AuthJS:** An application-level registration gate (e.g., `REGISTRATION_MODE=open|invite-only|disabled` env var) must exist before AuthJS is production-ready.

### 1.4 bootstrap-error.tsx — Clerk-Specific Auth in Error Boundary

```typescript
// src/app/auth/bootstrap/bootstrap-error.tsx
const { signOut } = useClerk(); // ← Clerk-specific
```

This component calls `signOut` from Clerk directly. For AuthJS, this must use `signOut` from `next-auth/react`. The sign-out action is auth-provider-specific and must be abstracted.

**Security implication:** If `AUTH_PROVIDER=authjs` is set and a bootstrap error occurs, the sign-out button in the error page would fail (or call Clerk's sign-out with no active Clerk session, leaving the user stuck). This is a runtime correctness issue, not a data security issue, but in an error recovery path it's significant.

---

## PART 2: Tenant/Organization Model — Security Implications

### 2.1 Current Model: Tenant IS Organization (Security Analysis)

The current `memberships` PK: `(userId, tenantId)` means:

- **A user can have exactly ONE role per tenant** — no ambiguity about which role applies
- Authorization checks are unambiguous: `isMember(userId, tenantId)` + `getRoles(userId, tenantId)`

For Variant C (multi-org per tenant), adding `(userId, organizationId)` memberships:

- Users may belong to multiple organizations within one tenant
- Authorization context must specify WHICH organization is active
- The active organization context becomes security-critical (like the current active tenant context)
- Without an explicit active organization context per request, authorization is ambiguous

**Security requirement for Variant C:** The active organization must be explicitly resolved per request (from cookie, header, or JWT claim), validated against membership, and never assumed from the URL or user input alone.

### 2.2 The `auth_tenant_identities` Table: Provider → Internal Tenant Mapping

Currently:

```sql
auth_tenant_identities: (provider, external_tenant_id) → tenant_id
```

This maps Clerk org IDs → internal tenant IDs. If we add organizations below tenants:

```sql
auth_tenant_identities: (provider, external_id) → tenant_id  -- for top-level mapping
auth_org_identities: (provider, external_id) → organization_id  -- for org-level mapping
```

**Security invariant must hold:** External provider IDs must never be trusted directly for authorization. The internal `organization_id` (UUID) is the authorization boundary, not the Clerk `org_xxx` string.

### 2.3 OrgProviderTenantResolver — Maps Provider Org → Internal Tenant

```typescript
// Currently: Clerk org_xxx → internal tenant UUID
// After Variant C: Clerk org_xxx → internal organization UUID (within a tenant)
```

This resolver would need to map to `organization_id`, not `tenant_id`. The security invariant (must go through DB lookup, never trust provider ID directly) remains unchanged — only the target entity changes.

### 2.4 Cross-Provider Email Linking — Not Affected by Org/Tenant Restructure

`CROSS_PROVIDER_EMAIL_LINKING=verified-only` policy in `ProvisioningService` operates at the user level (linking provider identities to users), not at the org/tenant level. This is unaffected by the tenant/org restructure.

---

## PART 3: Clerk Hard Constraints on Provider-Level Org Management

### What Clerk Can and Cannot Do

| Clerk Capability            | Can Change?                                | Constraint on Our Model                                      |
| --------------------------- | ------------------------------------------ | ------------------------------------------------------------ |
| Org membership (user ↔ org) | Cannot — Clerk manages this                | Our DB membership must sync with or be separate from Clerk's |
| Org hierarchy (parent org)  | Cannot — Clerk has no parent org concept   | The "tenant above org" layer must be purely app-level        |
| Org creation                | Can create orgs via Clerk API or dashboard | Our DB must create corresponding internal records            |
| Invitation flow             | Clerk manages invite email + acceptance    | For AuthJS, must build custom invite flow                    |
| Waitlist                    | Clerk manages waitlist email collection    | For AuthJS, must build custom or use third-party             |
| Sign-up restriction         | Clerk dashboard setting                    | For AuthJS, must implement at app level                      |
| SSO configuration           | Clerk manages per-org SSO (Enterprise)     | For AuthJS, app must implement SSO config storage            |

### Security Consequence: Clerk Org → Our Org vs Clerk Org → Our Tenant

**Current:** Clerk org (`org_xxx`) maps via `auth_tenant_identities` to our `tenant`  
**Proposed for Variant C:** Clerk org (`org_xxx`) would map to our `organization`, and our `tenant` is a higher-level app entity

**The security implication:** In `TENANCY_MODE=org+provider`, the session's `tenantExternalId` (Clerk's `orgId`) currently maps to an internal `tenantId`. After restructure, it would map to an internal `organizationId`. The `TenantResolver` result would return the `organizationId` (as the active workspace context), NOT a top-level tenant ID.

**The `TenantContext` interface would need to carry both:**

```typescript
interface TenantContext {
  readonly tenantId: TenantId; // top-level billing/compliance boundary
  readonly organizationId?: string; // operational unit (school, team)
  readonly userId: SubjectId;
}
```

Authorization decisions would be scoped to `organizationId` (where the user's role and data live), with some policies potentially scoped to `tenantId` (enterprise-level policies).

---

## PART 4: AuthJS-Specific Security Requirements

### 4.1 Things AuthJS Cannot Provide (Must Be App-Level)

| Feature                        | Clerk Provides                         | AuthJS Requires                                                                 |
| ------------------------------ | -------------------------------------- | ------------------------------------------------------------------------------- |
| Registration gate              | Dashboard toggle → no new sign-ups     | App-level middleware: check allowlist, invitation, or open flag                 |
| Email verification enforcement | Clerk verifies before allowing sign-in | App-level: check provider's `emailVerified` claim, block unverified emails      |
| Rate limiting on sign-in       | Clerk rate-limits sign-in attempts     | App-level + Upstash rate limiting (already exists for API, extend to /api/auth) |
| Invitation via email           | Clerk sends invitation emails          | Custom: generate token, store in DB, send email via SES/Resend/etc.             |
| Magic link sign-in             | Clerk provides natively                | Auth.js has `Resend` provider or `Email` provider                               |
| Organization management UI     | Clerk's `<OrganizationSwitcher>`       | Custom: query DB organizations, render switcher                                 |
| Session revocation             | Clerk dashboard                        | Custom: Auth.js database sessions or token blacklist                            |
| Brute-force protection         | Clerk handles                          | App-level (Upstash rate limiting — already exists)                              |

### 4.2 Registration Mode — Must Be Added to env.ts

For AuthJS, the app must control who can register:

```typescript
// Proposed addition to src/core/env.ts
REGISTRATION_MODE: z.enum(['open', 'invite-only', 'disabled']).default('open'),
```

Implementation:

- `open`: anyone with a valid OAuth or credentials can sign up
- `invite-only`: only users with a valid invitation token in the DB can sign in for the first time
- `disabled`: only Credentials-based (admin-created) users can sign in; no self-registration

### 4.3 Auth.js Rate Limiting on `/api/auth/`

The existing `withRateLimit` in `src/proxy.ts` applies to all routes matching the matcher. The `/api/auth/[...nextauth]` route will be rate-limited by this. Need to verify:

1. Rate limiting does not block legitimate OAuth callback loops (callback is hit multiple times during OAuth flow)
2. `/api/auth/session` polls (if enabled) don't trigger rate limiting
3. `/api/auth/csrf` requests don't get rate-limited

The current rate limit is request-count-based (e.g., 100 req/10s per IP). OAuth flows typically make 2-3 requests. This should be fine.

### 4.4 `AUTH_SECRET` Rotation Policy

For AuthJS JWT sessions, `AUTH_SECRET` rotation invalidates ALL existing sessions (all users are signed out). For Clerk, there's no equivalent single secret — Clerk manages session rotation via their infrastructure.

**Security recommendation:** Document `AUTH_SECRET` rotation procedure:

1. Generate new `AUTH_SECRET`
2. Deploy (all existing sessions immediately invalidated — users must re-authenticate)
3. No migration path without database sessions (another argument for potentially using database sessions for production-grade deployments)

---

## PART 5: Security Verdict

### Must-Fix Before ANY AuthJS Implementation

1. **Clarify/remove `ClerkUserRepository`** — dead code that violates security invariants if accidentally wired

2. **Decide tenant/organization restructure** — the authorization boundary must be correct before implementing a second auth adapter that both will share

3. **Define registration mode** — `REGISTRATION_MODE` env var and enforcement before AuthJS can be production-ready

### Must-Fix Before AuthJS is Feature-Complete

4. **Invitation system** — DB-level invitation table, token-based invitation flow, invitation email
5. **`bootstrap-error.tsx` sign-out abstraction** — abstract `signOut` to avoid Clerk dependency in error boundary
6. **Waitlist** — custom implementation or explicit removal for AuthJS mode

### Acceptable as Known Gaps (Post-Phase-6 Backlog)

7. **Session revocation** — JWT sessions can't be individually revoked without a token blacklist or database sessions
8. **SSO per-tenant config** — not in schema, not needed for boilerplate MVP
9. **Branding per org** — not in schema, not needed for boilerplate MVP

### Security Verdict

**BLOCKED on tenant/organization architecture decision.** The authorization boundary (what entity authorization decisions are scoped to) must be defined before implementing `AuthJsRequestIdentitySource.get()`, the provisioning input builder, and the `TenantResolver` for AuthJS — because all three depend on what "tenant" and "organization" mean in the updated schema.
