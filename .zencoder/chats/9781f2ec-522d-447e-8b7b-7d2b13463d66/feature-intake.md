# Feature Intake

## Task ID

`2026-04-22-forgot-password-email`

## Feature Description

**Bug fix**: The forgot-password flow generates a password reset token and stores it in the database,
but never sends the reset email to the user. The `EmailService` interface is missing `sendPasswordResetEmail`,
and the `/api/auth/forgot-password/route.ts` route does not call any email service after token creation.

This is a missing wiring in Phase 7.1 — credential auth was implemented but the email delivery step was never connected to the reset flow.

## Expected User-Visible Behavior

When a user submits the "Forgot password" form with a registered email address:

1. A password reset token is generated and stored in the database (already working)
2. An email is sent to the user with a link to `/auth/reset-password?token=<rawToken>`
3. The user receives the email and can complete the password reset

## Affected Modules / Files

- `src/modules/invitations/domain/EmailService.ts` — missing `sendPasswordResetEmail` method
- `src/modules/invitations/infrastructure/resend/ResendEmailService.ts` — needs implementation
- `src/modules/invitations/infrastructure/smtp/NodemailerEmailService.ts` — needs implementation
- `src/modules/invitations/infrastructure/NoOpEmailService.ts` — needs stub implementation
- `src/app/api/auth/forgot-password/route.ts` — needs to call the email service after token creation

## Root Cause

`/api/auth/forgot-password/route.ts` lines 84–117:

- Token is generated and persisted ✅
- `createEmailService(...)` is **never called** ❌
- `sendPasswordResetEmail(...)` does not exist on `EmailService` interface ❌

The signup route (`/api/auth/signup/route.ts`) uses `createEmailService` directly (not via DI),
building it from `env` at request time. The forgot-password route must follow the same pattern.

## Assumptions and Unknowns

- **Email service pattern**: Direct factory call from `env` (same as signup route), not DI container
- **Reset URL**: `${env.NEXT_PUBLIC_APP_URL}/auth/reset-password?token=${rawToken}`
- **Dev exposure**: When `AUTH_EXPOSE_RESET_TOKEN_IN_DEV=true`, the route already returns `devToken` and `devResetUrl` — but it still early-returns before reaching email send, which is intentional (dev token bypass)
- **NoOp behavior**: NoOpEmailService should log to console (same pattern as existing methods)

## Initial Scope Boundaries

**In scope:**

- Add `sendPasswordResetEmail` to `EmailService` interface
- Implement in all three adapters (Resend, Nodemailer, NoOp)
- Wire email sending in forgot-password route (after token creation, before return)
- Maintain the existing dev bypass path (`AUTH_EXPOSE_RESET_TOKEN_IN_DEV=true`) — still early-returns without sending email in dev-bypass mode

**Out of scope:**

- React Email templates (deferred per cumulative progress notes)
- New env vars
- Changes to reset-password page or token validation logic

## Auth / Security Impact

- The raw token is sent in the email link — this is the correct pattern (same as verification email)
- The token hash stored in DB, raw token only in the email link — TOCTOU-safe
- No PII in URL beyond the raw token itself (no email address in the URL)
- Dev bypass path (`AUTH_EXPOSE_RESET_TOKEN_IN_DEV`) must NOT trigger email sending

## Runtime Placement

- Route handler: Node.js runtime, already uses `await connection()` ✅
- `createEmailService` is called at request time from `env` — no prerender concerns

## Readiness Checklist

- [x] Root cause identified — missing `sendPasswordResetEmail` and missing wiring in route
- [x] Email service pattern understood — direct factory call from `env`
- [x] Dev bypass path understood — early-return before email send is intentional
- [x] All affected files identified
- [ ] Architecture review complete
- [ ] Security review complete
- [ ] Implementation complete
- [ ] Validation complete
