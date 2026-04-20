# Auth Provider Capability Matrix — Feature Parity Reference

## Purpose

This document defines the canonical feature parity matrix for all auth providers. Every feature in this matrix MUST be supported by every provider. If a provider lacks native support, the app-level implementation MUST provide the equivalent.

**Rule:** Every provider must have all features. Missing native support → app-level implementation with same contract.

---

## Provider Status Key

| Symbol       | Meaning                                                       |
| ------------ | ------------------------------------------------------------- |
| ✅ Native    | Provider supports this natively, minimal app code needed      |
| 🟡 App-level | App implements this on top of provider primitives             |
| 🔧 Custom    | Full custom implementation required (provider has no concept) |
| ⛔ Blocked   | Not possible, explicitly documented why                       |
| 📋 Stub      | Placeholder implemented, not yet functional                   |

---

## Matrix

### 1. Identity & Session

| Feature                  | Clerk                  | AuthJS                        | Supabase | Neon    |
| ------------------------ | ---------------------- | ----------------------------- | -------- | ------- |
| Server-side session read | ✅ `auth()`            | ✅ `auth()` from auth.ts      | 📋 stub  | 📋 stub |
| Edge-safe session check  | ✅ `clerkMiddleware()` | ✅ `auth` from auth.config.ts | 📋 stub  | 📋 stub |
| User ID in session       | ✅ `userId`            | ✅ JWT callback               | 📋 stub  | 📋 stub |
| Email claim              | ✅ sessionClaims       | ✅ session.user.email         | 📋 stub  | 📋 stub |
| Email verified claim     | ✅ Clerk enforces      | 🟡 Provider-dependent (OAuth) | 📋 stub  | 📋 stub |
| Session refresh          | ✅ Automatic           | ✅ JWT rotation               | 📋 stub  | 📋 stub |
| Multi-device sessions    | ✅ Clerk manages       | 🟡 JWT stateless              | 📋 stub  | 📋 stub |
| Session revocation       | ✅ Clerk dashboard     | 🔧 Requires DB session table  | 📋 stub  | 📋 stub |

### 2. Sign-in Methods

| Feature               | Clerk         | AuthJS                   | Supabase | Neon    |
| --------------------- | ------------- | ------------------------ | -------- | ------- |
| Email + Password      | ✅ Native     | ✅ Credentials provider  | 📋 stub  | 📋 stub |
| Magic Link (email)    | ✅ Native     | ✅ Email provider        | 📋 stub  | 📋 stub |
| Google OAuth          | ✅ Native     | ✅ Google provider       | 📋 stub  | 📋 stub |
| GitHub OAuth          | ✅ Native     | ✅ GitHub provider       | 📋 stub  | 📋 stub |
| Microsoft OAuth       | ✅ Native     | ✅ Azure provider        | 📋 stub  | 📋 stub |
| Apple OAuth           | ✅ Native     | ✅ Apple provider        | 📋 stub  | 📋 stub |
| SAML/SSO (enterprise) | ✅ Enterprise | 🔧 SAML plugin or custom | 📋 stub  | 📋 stub |
| Passkeys              | ✅ Native     | 🔧 WebAuthn libraries    | 📋 stub  | 📋 stub |
| Phone (SMS OTP)       | ✅ Native     | 🔧 Custom SMS provider   | 📋 stub  | 📋 stub |

### 3. Registration & Onboarding

| Feature                      | Clerk                | AuthJS                                                | Supabase | Neon    |
| ---------------------------- | -------------------- | ----------------------------------------------------- | -------- | ------- |
| Open registration            | ✅ Dashboard setting | 🟡 `REGISTRATION_MODE=open` guard                     | 📋 stub  | 📋 stub |
| Invite-only registration     | ✅ Dashboard setting | 🔧 `REGISTRATION_MODE=invite-only` + invitation check | 📋 stub  | 📋 stub |
| Disabled registration        | ✅ Dashboard setting | 🔧 `REGISTRATION_MODE=disabled` guard                 | 📋 stub  | 📋 stub |
| Onboarding flow (app-level)  | ✅ Provider-agnostic | ✅ Provider-agnostic                                  | 📋 stub  | 📋 stub |
| Email verification on signup | ✅ Clerk enforces    | 🟡 Must check `emailVerified` claim                   | 📋 stub  | 📋 stub |

### 4. Organization Management

| Feature                    | Clerk                                              | AuthJS                                        | Supabase | Neon    |
| -------------------------- | -------------------------------------------------- | --------------------------------------------- | -------- | ------- |
| Create organization        | ✅ `clerkClient.organizations.create()`            | 🔧 DB INSERT + `auth_organization_identities` | 📋 stub  | 📋 stub |
| List user organizations    | ✅ Clerk session                                   | 🔧 DB query on memberships                    | 📋 stub  | 📋 stub |
| Switch active organization | ✅ `setActive({ organization })`                   | 🔧 Update session JWT custom claim            | 📋 stub  | 📋 stub |
| Organization member list   | ✅ `clerkClient.organizations.getMembershipList()` | 🔧 DB memberships query                       | 📋 stub  | 📋 stub |
| Organization roles         | ✅ Clerk org:admin / org:member                    | 🔧 DB roles table                             | 📋 stub  | 📋 stub |
| Organization settings page | ✅ `<OrganizationProfile>`                         | 🔧 Custom UI                                  | 📋 stub  | 📋 stub |
| Organization switcher UI   | ✅ `<OrganizationSwitcher>`                        | 🔧 Custom component                           | 📋 stub  | 📋 stub |

### 5. Invitation System

| Feature                    | Clerk                                           | AuthJS                          | Supabase | Neon    |
| -------------------------- | ----------------------------------------------- | ------------------------------- | -------- | ------- |
| Send invitation            | ✅ `clerkClient.invitations.createInvitation()` | 🔧 DB token + email via app     | 📋 stub  | 📋 stub |
| Accept invitation via link | ✅ Clerk handles                                | 🔧 Token validate + provision   | 📋 stub  | 📋 stub |
| Revoke invitation          | ✅ `clerkClient.invitations.revokeInvitation()` | 🔧 DB status update             | 📋 stub  | 📋 stub |
| List pending invitations   | ✅ Clerk API                                    | 🔧 DB query                     | 📋 stub  | 📋 stub |
| Invitation email template  | ✅ Clerk email                                  | 🔧 Custom email via Resend/SMTP | 📋 stub  | 📋 stub |
| Invitation expiry          | ✅ Clerk manages                                | 🔧 `expiresAt` in DB + cron     | 📋 stub  | 📋 stub |

### 6. Waitlist System

| Feature                     | Clerk                     | AuthJS                            | Supabase | Neon    |
| --------------------------- | ------------------------- | --------------------------------- | -------- | ------- |
| Join waitlist               | ✅ `<Waitlist>` component | 🔧 Custom DB + form               | 📋 stub  | 📋 stub |
| Admin approve waitlist      | ✅ Clerk dashboard        | 🔧 Admin API + invitation trigger | 📋 stub  | 📋 stub |
| Waitlist status check       | ✅ Clerk manages          | 🔧 DB query by email              | 📋 stub  | 📋 stub |
| Approval notification email | ✅ Clerk email            | 🔧 Custom email + invitation link | 📋 stub  | 📋 stub |

### 7. User Management

| Feature           | Clerk                               | AuthJS                            | Supabase | Neon    |
| ----------------- | ----------------------------------- | --------------------------------- | -------- | ------- |
| User profile page | ✅ `<UserProfile>`                  | 🔧 Custom UI                      | 📋 stub  | 📋 stub |
| Change email      | ✅ Clerk manages                    | 🔧 Verification flow + DB update  | 📋 stub  | 📋 stub |
| Change password   | ✅ Clerk manages                    | 🔧 Custom form                    | 📋 stub  | 📋 stub |
| Delete account    | ✅ `clerkClient.users.deleteUser()` | 🔧 Custom flow + cascade          | 📋 stub  | 📋 stub |
| User metadata     | ✅ Clerk publicMetadata             | 🔧 DB users table extended fields | 📋 stub  | 📋 stub |
| Admin user list   | ✅ Clerk dashboard                  | 🔧 Custom admin UI                | 📋 stub  | 📋 stub |

### 8. Security

| Feature                  | Clerk             | AuthJS                            | Supabase | Neon    |
| ------------------------ | ----------------- | --------------------------------- | -------- | ------- |
| CSRF protection          | ✅ Clerk handles  | ✅ Auth.js built-in               | 📋 stub  | 📋 stub |
| Rate limiting (sign-in)  | ✅ Clerk internal | 🟡 Upstash on /api/auth/\*        | 📋 stub  | 📋 stub |
| Brute force protection   | ✅ Clerk internal | 🟡 Upstash rate limit             | 📋 stub  | 📋 stub |
| JWT signing              | ✅ Clerk manages  | ✅ `AUTH_SECRET` env              | 📋 stub  | 📋 stub |
| Session encryption       | ✅ Clerk manages  | ✅ Auth.js cookie                 | 📋 stub  | 📋 stub |
| Bot protection (CAPTCHA) | ✅ Clerk option   | 🔧 hCaptcha/Turnstile integration | 📋 stub  | 📋 stub |

---

## App-Level Implementations Required Per Provider

### AuthJS (next-auth v5)

The following require full custom implementation (no native support):

1. **Organization management** — DB-only, custom switcher UI
2. **Invitation system** — DB tokens + email sending
3. **Waitlist** — DB entries + admin approval UI
4. **Registration mode gating** — proxy.ts + route handler guard
5. **Organization switcher** — custom React component (DB query)
6. **User profile page** — custom form

### Supabase (future)

The following are known gaps (to be detailed when implementing):

- Similar to AuthJS for org management
- Supabase has RLS (Row Level Security) which can assist with tenant isolation
- Uses `supabase.auth.admin.*` for user management

### Neon (future)

- Similar to AuthJS for most features
- Neon is DB-first — no auth primitives provided
- Full custom auth layer required

---

## Compatibility Matrix (Provider Switching)

| Migration Path      | Data Preserved                                                | Steps Required                                                      |
| ------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------- |
| `clerk → authjs`    | users (by email), organizations, memberships, roles, policies | Re-link identities, new session type, email/password or OAuth setup |
| `clerk → supabase`  | Same as clerk → authjs                                        | Re-link identities, Supabase session setup                          |
| `authjs → clerk`    | Same                                                          | Clerk user import (API), org sync                                   |
| `authjs → supabase` | users, orgs, memberships                                      | Re-link identities                                                  |

**Golden rule:** All business data (users, orgs, memberships, roles, policies, content) is preserved. Only auth identity records and session tokens change.
