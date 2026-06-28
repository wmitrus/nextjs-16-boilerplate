# Feature Intake — Waitlist Email Flow

## Task ID

`2026-04-22-waitlist-email-flow`

## Root Problem

The waitlist implementation stores entries in the DB but sends zero emails. Professional
waitlist flows require 3 emails: join confirmation, admin approval (with invite link), and
optional rejection notification.

## Scope

1. Confirmation email on `joinWaitlist` (mandatory)
2. Approval → create invitation + send invite email via existing `InvitationService` (mandatory)
3. Optional rejection email gated by `WAITLIST_SEND_REJECTION_EMAIL=true` (optional)
4. `/auth/invite/[token]` UI page — missing invite acceptance landing page (mandatory to close
   the invitation flow end-to-end)
5. Registration mode bypass for `/auth/signup?invitation_token=X` (AuthJS provider)
6. Signup route: accept invitation token after successful account creation

## Affected Files

- `src/modules/invitations/domain/EmailService.ts`
- `src/modules/invitations/infrastructure/resend/ResendEmailService.ts`
- `src/modules/invitations/infrastructure/smtp/NodemailerEmailService.ts`
- `src/modules/invitations/infrastructure/NoOpEmailService.ts`
- `src/modules/waitlist/infrastructure/DefaultWaitlistService.ts`
- `src/app/api/auth/waitlist/route.ts`
- `src/app/api/admin/waitlist/[id]/route.ts`
- `src/core/env.ts`
- `.env.example`
- `src/security/middleware/with-registration-mode.ts`
- `src/app/auth/signup/page.tsx`
- `src/app/auth/signup/sign-up-client.tsx`
- `src/app/api/auth/signup/route.ts`
- NEW: `src/app/auth/invite/[token]/page.tsx`

## New Env Vars

- `WAITLIST_INVITE_ORGANIZATION_ID` (optional UUID) — org that approved users join
- `WAITLIST_INVITE_ROLE_ID` (optional UUID) — role assigned to approved users
- `WAITLIST_SEND_REJECTION_EMAIL` (optional bool, default false)

## Architecture Decision

- Approval → invitation wiring lives in the admin route handler (not DefaultWaitlistService)
  to avoid circular service coupling (waitlist → invitation → email)
- DefaultWaitlistService receives EmailService for confirmation + rejection emails
- Rejection email sent only if WAITLIST_SEND_REJECTION_EMAIL=true (caller checks)
