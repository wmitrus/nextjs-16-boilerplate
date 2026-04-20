# Design Discussion — Tenant/Organization Model and AuthJS Pre-Implementation Review

## Status: DISCUSSION DOCUMENT — Requires User Decision Before Implementation

---

## Executive Summary

Based on deep code analysis, **three critical design questions must be answered before AuthJS implementation begins**. The answers affect the DB schema, contracts, provisioning service, authorization service, and BOTH auth adapters (Clerk and AuthJS).

---

## CRITICAL QUESTION 1: What Should "Tenant" and "Organization" Mean in the Boilerplate?

### Current State (What the Code Actually Has)

The current model has **one level** of grouping:

```
User → Membership → Tenant (with roles: owner/member)
```

The DB `tenants` table is conceptually an **Organization** in the tenants-vs-orgs sense — it's the operational business unit where users work. The naming says "tenant" but it behaves like "organization."

This maps perfectly to **Variant B** from your document:

- One school = one tenant in DB
- Users belong to that tenant

### What Variant C Requires (Your Sample App Target)

```
Tenant (EduGroup — billing/SSO boundary)
  └── Organization/School A
  └── Organization/School B
  └── Organization/School C
```

This requires a **two-level hierarchy** that doesn't currently exist.

### The Three Options

**Option 1: Keep current model — document Variant C as future**

- No schema changes needed now
- AuthJS implementation proceeds against current schema
- Variant C sample app cannot be built until future refactor
- ❌ User explicitly wants Variant C as proof of correctness

**Option 2: Extend current model — add `organizations` table**

New schema:

```sql
tenants:        { id, name, slug, plan }        -- EduGroup (top-level boundary)
organizations:  { id, tenant_id, name, slug }   -- School A, School B
memberships:    { user_id, org_id, role_id }    -- user belongs to specific school
roles:          { id, org_id, name }            -- role scoped to organization
policies:       { id, org_id, role_id, ... }    -- policies scoped to organization
```

Impacts:

- ✅ Supports both Variant B (simple: auto-create one org per tenant) and Variant C
- 🔴 Breaking DB schema change — all existing relations change from `tenant_id` to `org_id`
- 🔴 All contracts change: `TenantContext`, `TenantResolver`, `MembershipRepository`, `PolicyRepository`
- 🔴 Provisioning service needs full rework
- 🔴 Both Clerk and AuthJS adapters affected
- 🔴 If done NOW: both adapters can be designed against the correct schema

**Option 3: Keep "tenant" as the authorization scope, add parent entity**

```sql
accounts:       { id, name }                    -- EduGroup (top-level)
tenants:        { id, account_id, name }        -- School A (current "tenant" becomes org-level)
memberships:    { user_id, tenant_id, role_id } -- unchanged, but "tenant" is now a school
```

The word "tenant" stays but now means "organization" (school). `account` is the new top-level. Less confusing for existing code — only `account_id` is added.

Impacts:

- 🟡 Less naming confusion internally (tenant still = authorization scope)
- ✅ Smaller change — only `accounts` table is new, FK added to `tenants`
- 🔴 `TenantContext` needs `accountId` for enterprise policies
- Still requires provisioning changes for creating accounts

### Recommendation from Architecture Guard

**Option 2 (or a variant of Option 3) should be done BEFORE AuthJS, given the goal.**

The key reason: if we implement AuthJS against the current single-level schema and then add organizations, we need to update AuthJS adapter, Clerk adapter, provisioning, and authorization all at once. Doing it before means both adapters are designed correctly from day one.

---

## CRITICAL QUESTION 2: Is the Invitation System In Scope?

### Current State

`USER_INVITE` action exists in the authorization policy system. `ownerPolicies` grants owners the `user:invite` permission. But:

- **No invitation table exists in the DB**
- **No invitation service exists**
- **No invitation API endpoint exists**
- **No invitation email flow exists**
- Clerk mode: invitations go through Clerk's dashboard/API → Clerk email → user signs up → bootstrap

### The Gap

The policy system says "owners can invite users" but there is no mechanism to actually invite users (except through Clerk's UI for Clerk mode).

### For AuthJS + Invite-Only Mode

AuthJS has no invitation system. If `REGISTRATION_MODE=invite-only`, the app must:

1. Allow owners to create invitations (store token, expiry, target email in DB)
2. Send invitation email (requires email provider: Resend, SendGrid, SES)
3. User clicks link → lands on sign-in/sign-up with pre-filled email
4. After sign-in: invitation is consumed, user is provisioned to the inviting organization

### Decision Needed

- Is invitation system in scope for THIS task (AuthJS adapter)?
- Or is it a separate future task?
- If separate: the `USER_INVITE` policy action should be documented as "UI not yet implemented"

---

## CRITICAL QUESTION 3: What Is the Registration Mode Story?

### Current State

- Clerk mode: registration is controlled via Clerk dashboard (can disable public sign-up)
- Waitlist (`/waitlist`): uses `<Waitlist>` Clerk component — Clerk manages the email collection and approval
- No app-level registration gate exists

### For AuthJS

Any user who reaches `/api/auth/signup` or signs in with a new OAuth account can register. There is no gate. For a production boilerplate:

- `REGISTRATION_MODE=open` — anyone can register (development/testing default)
- `REGISTRATION_MODE=invite-only` — only invited users can register
- `REGISTRATION_MODE=disabled` — no new sign-ups (admin manages users via DB)

### The Waitlist

The current `/waitlist` page is 100% Clerk-specific:

```tsx
import { Waitlist } from '@clerk/nextjs';
export default function WaitlistPage() {
  return <Waitlist />;
}
```

For AuthJS: this needs either a custom waitlist implementation (collect emails, admin reviews, send invitations) or explicit documentation that waitlist is Clerk-only.

### Decision Needed

- Should `REGISTRATION_MODE` env var be added?
- Should custom waitlist be part of the AuthJS implementation?
- Or should the waitlist page only render for `AUTH_PROVIDER=clerk`?

---

## Full Feature Parity Matrix: Clerk vs AuthJS

### Identity Layer (Core)

| Feature                 | Clerk (Current)                | AuthJS (Status)                | Notes                      |
| ----------------------- | ------------------------------ | ------------------------------ | -------------------------- |
| Session read (server)   | `auth()`                       | 🟡 Needs `auth()` from auth.ts | Contractual parity exists  |
| User ID in session      | `userId`                       | 🟡 Needs `session.user.id`     | JWT callback required      |
| Email claim             | `sessionClaims.email`          | 🟡 `session.user.email`        | Direct mapping             |
| Email verified claim    | `sessionClaims.email_verified` | 🟡 Provider-dependent          | Security-critical          |
| Org ID (for org mode)   | `orgId`                        | 🔴 No native equivalent        | Custom session field       |
| Org role (for org mode) | `orgRole`                      | 🔴 No native equivalent        | Custom session field       |
| Edge session check      | `clerkMiddleware()`            | 🟡 `auth` from auth.config.ts  | Needs edge identity source |

### UI Layer

| Feature                 | Clerk (Current)               | AuthJS (Status)                     | Notes                |
| ----------------------- | ----------------------------- | ----------------------------------- | -------------------- |
| Layout provider         | `<ClerkProvider>`             | 🟡 `<SessionProvider>`              | Simple replacement   |
| Sign-in page            | `<SignIn>` full component     | 🔴 Custom form needed               | Full custom build    |
| Sign-up page            | `<SignUp>` full component     | 🔴 Custom form or redirect          | Full custom build    |
| Header sign-in button   | `<SignInButton>`              | 🟡 Button calling `signIn()`        | Simple               |
| Header sign-out         | `<SignedIn>` + `<UserButton>` | 🟡 `useSession()` + custom menu     | Medium complexity    |
| Organization switcher   | `<OrganizationSwitcher>`      | 🔴 Must query DB                    | Full custom build    |
| Waitlist page           | `<Waitlist>`                  | 🔴 No equivalent                    | Custom or Clerk-only |
| Error recovery sign-out | `useClerk().signOut()`        | 🟡 `signOut()` from next-auth/react | Simple replacement   |

### Flow Layer

| Feature                               | Clerk (Current)            | AuthJS (Status)                         | Notes                          |
| ------------------------------------- | -------------------------- | --------------------------------------- | ------------------------------ |
| Bootstrap after auth                  | ✅ Provider-agnostic       | ✅ Already provider-agnostic            | Works for both                 |
| Onboarding form                       | ✅ Provider-agnostic       | ✅ Works for both                       | DB-based                       |
| Provisioning (user/tenant/membership) | ✅ Provider-agnostic       | 🔴 Needs org model decision             | DB-based but schema may change |
| Invitation flow                       | ❌ Clerk dashboard only    | 🔴 Needs full custom implementation     | DB invitations                 |
| Registration gating                   | ❌ Clerk dashboard setting | 🔴 Needs `REGISTRATION_MODE` env        | App-level gate                 |
| Email verification during sign-in     | ❌ Clerk enforces natively | 🔴 App must check `emailVerified` claim | Auth.js doesn't enforce        |

### Infrastructure Layer

| Feature                    | Clerk (Current)     | AuthJS (Status)                      | Notes                             |
| -------------------------- | ------------------- | ------------------------------------ | --------------------------------- |
| Rate limiting sign-in      | Clerk internal      | 🟡 Upstash applies to /api/auth/\*   | Verify rate limits are reasonable |
| Session security (cookies) | Clerk manages       | 🟡 Auth.js manages (JWT, httpOnly)   | Correct by default                |
| `AUTH_SECRET` management   | N/A                 | 🔴 Need strong secret + rotation doc | Critical                          |
| Org creation API           | Clerk API + webhook | 🔴 Custom DB endpoint needed         | For org management UI             |

---

## Recommended Decision Path

### Step 1: Architecture Decision (Before Any Code)

1. Choose tenant/organization model (Option 2 or 3)
2. Define scope of invitation system
3. Define registration mode requirements

### Step 2: Schema + Contract Update (Shared Foundation)

Whichever option chosen — update DB schema, update contracts, update provisioning service. This is a **shared foundation** that both Clerk and AuthJS adapters build on.

### Step 3: Safe AuthJS Foundation (Identity Only)

While Step 2 is happening or after, implement Auth.js identity foundation:

- `next-auth` package installation
- `auth.config.ts` + `auth.ts`
- Route handler
- `AuthJsRequestIdentitySource` (claims mapping only — no tenant logic)

### Step 4: AuthJS + New Schema Integration

Once schema is updated:

- Update provisioning service to new org model
- Wire AuthJS adapter to new provisioning input
- Implement org selection for AuthJS (DB-based, no Clerk org switcher)

### Step 5: AuthJS UI

Sign-in/sign-up pages, header controls, session provider

### Step 6: Feature Parity (Invitation, Registration Mode)

Custom invitation system, registration gating

### Step 7: Variant C Sample App

EduGroup → Schools demo application

---

## What We Can Do RIGHT NOW (Before Decisions)

The following does NOT depend on the tenant/org decision:

1. **Install `next-auth` package** — neutral installation
2. **Create `auth.config.ts`** — JWT config, providers, callbacks for email/emailVerified/userId
3. **Create `auth.ts`** — full Node instance
4. **Create route handler** — with `await connection()` pattern
5. **Update `src/core/env.ts`** — add `AUTH_SECRET`, `AUTH_URL`, provider secrets
6. **Remove or document `ClerkUserRepository`** — dead code removal

**These 6 items are safe neutral foundation work that doesn't touch tenant/org model.**

---

## Questions for the User to Answer

1. **Tenant/Organization model:** Which option (1/2/3) should we implement?
   - If Option 2 or 3: should this be a separate task/PR before AuthJS continues?
2. **Invitation system:** In scope for AuthJS task? Or separate future task?

3. **Registration mode:** Should `REGISTRATION_MODE` env var be added? What modes?

4. **Waitlist:** Custom implementation for AuthJS? Or Clerk-only feature (page shows "Clerk only" for other providers)?

5. **`ClerkUserRepository`:** Remove it? Or keep with deprecation comment?

6. **Sample Variant C app:** Should it be part of this boilerplate repo (as a `src/features/edu-demo` or `examples/` directory)? Or a separate repo?
