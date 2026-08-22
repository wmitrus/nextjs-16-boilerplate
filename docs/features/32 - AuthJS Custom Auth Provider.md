# 32 — AuthJS Custom Auth Provider

## Overview

This boilerplate supports two authentication providers controlled by the `AUTH_PROVIDER` environment variable:

- `clerk` — Clerk-hosted auth (default, UI managed by Clerk)
- `authjs` — Custom in-app auth built on NextAuth v5 (Auth.js), with full credential and email-verification flows

This document covers the **AuthJS provider** only. For Clerk, see `docs/features/15 - Clerk Authentication.md`.

---

## Activation

```dotenv
AUTH_PROVIDER=authjs
```

---

## Features

| Feature                     | Supported | Notes                                          |
| --------------------------- | --------- | ---------------------------------------------- |
| Email + password sign-up    | ✅        | `/auth/signup`                                 |
| Email verification          | ✅        | Required before sign-in                        |
| Email + password sign-in    | ✅        | `/auth/signin`                                 |
| Forgot password             | ✅        | `/auth/forgot-password`                        |
| Password reset via token    | ✅        | `/auth/reset-password?token=<token>`           |
| Invitation-based sign-up    | ✅        | `/auth/signup?invitation_token=<token>`        |
| Invite acceptance page      | ✅        | `/auth/invite/<token>`                         |
| Waitlist (invite-only mode) | ✅        | `/waitlist` + email confirmation               |
| Admin waitlist approval     | ✅        | `POST /api/admin/waitlist/[id]?action=approve` |
| Registration mode control   | ✅        | `open`, `invite-only`, `disabled`              |
| Email delivery adapters     | ✅        | `none` (NoOp), `resend`, `smtp`                |

---

## Routes

### UI Pages

| Path                           | Description                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------- |
| `/auth/signin`                 | Sign in form (email + password)                                                 |
| `/auth/signup`                 | Sign up form; requires `?invitation_token` when `REGISTRATION_MODE=invite-only` |
| `/auth/forgot-password`        | Request password reset email                                                    |
| `/auth/reset-password?token=X` | Set new password via reset token                                                |
| `/auth/verify-email-pending`   | Post-signup holding page                                                        |
| `/auth/verify-email?token=X`   | Verify email address via link                                                   |
| `/auth/invite/[token]`         | Invitation acceptance landing page                                              |
| `/auth/registration-closed`    | Shown when `REGISTRATION_MODE=disabled`                                         |
| `/waitlist`                    | Join the waitlist (when `REGISTRATION_MODE=invite-only`)                        |

### API Endpoints

| Endpoint                                          | Method | Description                                     |
| ------------------------------------------------- | ------ | ----------------------------------------------- |
| `/api/auth/signup`                                | POST   | Create account; accepts `invitationToken` field |
| `/api/auth/forgot-password`                       | POST   | Request password reset email                    |
| `/api/auth/reset-password`                        | POST   | Confirm new password with token                 |
| `/api/auth/resend-verification`                   | POST   | Re-send email verification link                 |
| `/api/auth/verify-email`                          | GET    | Confirm email token (redirects)                 |
| `/api/auth/invite`                                | POST   | Create an invitation                            |
| `/api/auth/invite/[token]`                        | GET    | Validate / accept an invitation                 |
| `/api/auth/waitlist`                              | POST   | Join the waitlist                               |
| `/api/auth/[...nextauth]`                         | ALL    | NextAuth session handlers                       |
| `/api/admin/waitlist/[id]?action=approve\|reject` | POST   | Admin: approve or reject waitlist entry         |

---

## Registration Modes

Controlled by `REGISTRATION_MODE` env var:

| Mode          | Behavior                                                                                             |
| ------------- | ---------------------------------------------------------------------------------------------------- |
| `invite-only` | Default. Sign-up requires `?invitation_token`; `/auth/signup` without token redirects to `/waitlist` |
| `open`        | Anyone can sign up (requires email delivery or dev bypass)                                           |
| `disabled`    | No new sign-ups; `/auth/signup` redirects to `/auth/registration-closed`                             |

---

## Email Delivery

Controlled by `EMAIL_PROVIDER`:

| Provider | Description                            | Required env vars                                                     |
| -------- | -------------------------------------- | --------------------------------------------------------------------- |
| `none`   | NoOp — logs to console, no real emails | None                                                                  |
| `resend` | Resend API                             | `RESEND_API_KEY`, `RESEND_FROM_EMAIL`                                 |
| `smtp`   | SMTP via Nodemailer                    | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM_EMAIL` |

### Gmail SMTP Setup

Standard Gmail accounts are **not supported by Resend** (unverified domain).

For SMTP with Gmail:

```dotenv
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=you@gmail.com
SMTP_PASS=<google-app-password>
SMTP_FROM_EMAIL=you@gmail.com
```

> **Important**: Use a Google App Password (not your Gmail password). Enable 2FA on your Google account first, then generate an App Password at `myaccount.google.com/apppasswords`.

For corporate Google Workspace accounts: same setup, but `SMTP_USER` and `SMTP_FROM_EMAIL` use your company domain.

---

## Waitlist Flow

When `REGISTRATION_MODE=invite-only`:

1. User visits `/auth/signup` → redirected to `/waitlist`
2. User fills in the waitlist form → `POST /api/auth/waitlist`
3. System stores entry, sends **confirmation email** (via EmailService)
4. Admin approves via `POST /api/admin/waitlist/[id]?action=approve`
5. System marks entry as approved, creates an invitation, and sends **invite email**
6. User receives invite link → visits `/auth/invite/<token>` → sign up page with pre-filled token

### Waitlist Admin Env Vars

```dotenv
WAITLIST_INVITE_ORGANIZATION_ID=<uuid>    # optional — org the approved user joins
WAITLIST_INVITE_ROLE_ID=<uuid>            # optional — role assigned to approved user
WAITLIST_SEND_REJECTION_EMAIL=false       # set to true to email rejected applicants
```

For `TENANCY_MODE=single`, these env vars are **optional** — org and member role are auto-resolved from the DB at approval time. See `docs/features/33 - Waitlist Email Flow.md` for the complete flow, email content, and multi-tenancy resolution logic.

---

## Invitation Flow

1. Admin creates invitation via `POST /api/auth/invite` with `{ email, organizationId, roleId }`
2. System generates invite token, stores it, sends invite email
3. User visits `/auth/invite/<token>` → landing page shows invitation details
4. User clicks **Create account & accept** → `/auth/signup?invitation_token=<token>`
5. On successful signup, `acceptInvitation()` is called to mark the token as used

---

## Development Bypass Options

To avoid needing a real email server in development:

```dotenv
# Option A: Auto-verify emails on signup (no email required)
AUTH_DEV_AUTO_VERIFY=true

# Option B: Log verification token to server console
AUTH_EXPOSE_VERIFICATION_TOKEN_IN_DEV=true

# For password resets: log reset URL to server console
AUTH_EXPOSE_RESET_TOKEN_IN_DEV=true

# Use NoOp email (logs to console, no real send)
EMAIL_PROVIDER=none
```

> `AUTH_DEV_AUTO_VERIFY` and `AUTH_EXPOSE_VERIFICATION_TOKEN_IN_DEV` **cannot both be true** simultaneously. `AUTH_DEV_AUTO_VERIFY=true` is banned in production.

---

## Testing Flows Manually

### Production URL Configuration

For `AUTH_PROVIDER=authjs`, Production should have a canonical AuthJS origin:

```dotenv
NEXTAUTH_URL=https://app.example.com
```

Set this in Vercel **Production** only. It is required for AuthJS Production
runtime, not only for the build. Do not set the production URL as an
`All Environments` variable, because Preview deployments should keep their own
Vercel deployment URL unless you intentionally configure a separate preview
origin.

The production GitHub Actions workflow intentionally does **not** synthesize
`NEXTAUTH_URL` from `NEXT_PUBLIC_APP_URL`. If `AUTH_PROVIDER=authjs` and the
Production runtime env is missing `NEXTAUTH_URL`, the workflow fails before
`vercel build --prod`. This prevents a build-only workaround from masking a
broken runtime configuration.

This requirement is AuthJS-specific. It does not apply when
`AUTH_PROVIDER=clerk`.

### Open Registration (with NoOp email)

```dotenv
AUTH_PROVIDER=authjs
REGISTRATION_MODE=open
EMAIL_PROVIDER=none
AUTH_DEV_AUTO_VERIFY=true
```

1. Visit `/auth/signup`, create account → auto-verified
2. Sign in at `/auth/signin`

### Invite-only (Waitlist)

```dotenv
AUTH_PROVIDER=authjs
REGISTRATION_MODE=invite-only
EMAIL_PROVIDER=none
```

1. Visit `/waitlist`, submit email → confirmation logged to console
2. Call `POST /api/admin/waitlist/<id>?action=approve` with admin credentials
3. Check server logs for invite URL (NoOp email)
4. Visit `/auth/invite/<token>` → sign up

### Forgot Password

```dotenv
AUTH_EXPOSE_RESET_TOKEN_IN_DEV=true
```

1. Visit `/auth/forgot-password`, submit email
2. Check server logs for reset URL
3. Visit `/auth/reset-password?token=<token>`, set new password

---

## Module Structure

```text
src/modules/auth/
  infrastructure/authjs/
    auth.ts                        # NextAuth configuration
    auth.config.ts                 # Shared config (Edge-safe)
    AuthJsEdgeIdentitySource.ts    # Edge runtime identity
    AuthJsRequestIdentitySource.ts # Node runtime identity
    next-auth.d.ts                 # Session type extensions
  infrastructure/drizzle/
    schema.ts                      # DB tables (users, credentials, tokens)
  ui/authjs/
    HeaderAuthControlsAuthjs.tsx   # Header sign-in/sign-out controls
    SessionProvider.tsx            # Client-side session context
    AuthJsWorkspaceSwitcher.tsx    # Workspace/org switcher

src/app/auth/                      # AuthJS-specific UI pages
src/app/api/auth/                  # AuthJS API route handlers

src/shared/lib/rate-limit/
  login-abuse-control.ts           # Account-bucket progressive failure counter (SEC-34)
src/shared/lib/captcha/
  turnstile.ts                     # Server-side Cloudflare Turnstile verification
src/shared/components/captcha/
  TurnstileWidget.tsx               # Client widget (Managed mode)
```

---

## Security Notes

- Password hashing: bcrypt (via `bcryptjs`)
- Password reset tokens: cryptographically random (`node:crypto`), 1-hour expiry
- Email verification tokens: cryptographically random, 24-hour expiry
- User enumeration protection: forgot-password returns `200` regardless of email existence
- Invitation tokens: single-use, configurable expiry
- Registration mode enforced in `src/proxy.ts` (middleware-equivalent)
- `INTERNAL_API_KEY` guards admin endpoints via `withNodeProvisioning`

### Login Abuse Control (SEC-34)

`/api/auth/callback/credentials` (Credentials `authorize()`) is protected by
two **independent** rate/abuse buckets — rotating one dimension (IP or
account) doesn't bypass the other:

1. **IP bucket** — a dedicated sliding-window rate limit
   (`LOGIN_RATE_LIMIT_IP_REQUESTS` / `LOGIN_RATE_LIMIT_IP_WINDOW`, default
   20 requests / 15 min), checked in the route handler
   (`src/app/api/auth/[...nextauth]/route.ts`) before NextAuth even runs.
   Deliberately separate from the generic `API_RATE_LIMIT_*` used by every
   other API route — a login endpoint needs a much tighter limit than
   general API traffic.
2. **Account bucket** — a progressive failure counter, keyed by a
   SHA-256 hash of the normalized email (never the raw email), tracked in
   `src/shared/lib/rate-limit/login-abuse-control.ts` and enforced inside
   `authorize()` itself (`src/modules/auth/infrastructure/authjs/auth.ts`),
   **before** any DB query or bcrypt comparison for a locked account.
   Crossing each threshold escalates the response instead of one flat
   cutoff:
   - `LOGIN_ABUSE_CAPTCHA_THRESHOLD` (default 3) — requires a valid
     Cloudflare Turnstile token on the next attempt.
   - `LOGIN_ABUSE_DELAY_THRESHOLD` (default 8) — adds an increasing
     artificial delay (2s, 4s, 8s, capped at 10s) before processing the
     next attempt.
   - `LOGIN_ABUSE_LOCK_THRESHOLD` (default 15) — temporarily locks the
     account for the remainder of `LOGIN_ABUSE_WINDOW` (default 30 min).
   - A successful login resets the counter. A wrong-password/unknown-email
     attempt increments it; a correct-password-but-unverified-email attempt
     does neither (it's not evidence of an attack).

**CAPTCHA**: [Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/),
Managed mode — Cloudflare's own risk engine decides whether the visitor
sees nothing, a checkbox, or an interactive puzzle; this repo only decides
_when_ to require a token (the account-bucket threshold above), never _how
hard_ the challenge is. Configure `TURNSTILE_SECRET_KEY` (server) and
`NEXT_PUBLIC_TURNSTILE_SITE_KEY` (client) to enable it — when either is
unset, the CAPTCHA gate is skipped entirely (progressive delay/lock still
apply); the client (`src/app/auth/signin/sign-in-client.tsx`) only renders
the widget after the server actually returns `CaptchaRequired`, never
speculatively. `challenges.cloudflare.com` is already CSP-allowlisted
(`CLOUDFLARE_DOMAINS` in `src/security/middleware/with-headers.ts`) — no
CSP changes are needed to use this.

**E2E bypass**: both buckets are skipped entirely when `E2E_ENABLED=true`
— stable AuthJS test fixtures are reused across many specs, and this
prevents one spec's deliberate wrong-password test from
captcha-gating/locking an account that a different, unrelated spec needs a
moment later.

Full writeup: SEC-34 in `docs/ai/general/SECURITY_CODING_PATTERNS.md`.

---

## Known Constraints

- `AUTH_PROVIDER` switching (clerk ↔ authjs) at runtime is not supported — restart required
- Clerk and AuthJS user records are separate; no migration path between providers
- AuthJS does not support social/OAuth providers in this boilerplate (credentials-only)
- AuthJS Production requires a Production-scoped `NEXTAUTH_URL`; Clerk does not require `NEXTAUTH_URL`.
- `REGISTRATION_MODE=open` in production requires a real `EMAIL_PROVIDER` (not `none`)
