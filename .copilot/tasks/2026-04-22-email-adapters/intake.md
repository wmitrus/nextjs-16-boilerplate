# Intake — Phase 8: Email Adapters

## Objective

Add real email delivery support to the authjs verification flow and invitation flow via two adapters: Resend (API key based) and Nodemailer/SMTP (Gmail or any SMTP). `NoOpEmailService` remains the default when no provider is configured.

## Requirements

1. Both adapters implement the existing `EmailService` interface, extended with `sendVerificationEmail`
2. Factory function `createEmailService(env)` selects adapter based on `EMAIL_PROVIDER` env var
3. `EMAIL_PROVIDER=resend` → `ResendEmailService` (requires `RESEND_API_KEY` + `RESEND_FROM_EMAIL`)
4. `EMAIL_PROVIDER=smtp` → `NodemailerEmailService` (requires `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM_EMAIL`)
5. `EMAIL_PROVIDER=none` (default) → `NoOpEmailService`
6. Signup route calls `emailService.sendVerificationEmail()` after token creation (non-auto-verify path)
7. Resend-verification route calls `emailService.sendVerificationEmail()` after token regeneration
8. Invite route wired to factory (replaces hardcoded `new NoOpEmailService()`)
9. Env vars added to `src/core/env.ts` (T3-Env/Zod) and `.env.example`
10. Unit tests for factory + both adapters (mocked transports)

## Affected Files

- `src/modules/invitations/domain/EmailService.ts` — extend interface
- `src/modules/invitations/infrastructure/NoOpEmailService.ts` — add new method stub
- `src/modules/invitations/infrastructure/resend/ResendEmailService.ts` — NEW
- `src/modules/invitations/infrastructure/smtp/NodemailerEmailService.ts` — NEW
- `src/modules/invitations/infrastructure/EmailServiceFactory.ts` — NEW
- `src/modules/invitations/index.ts` — export factory + new types
- `src/core/env.ts` — add `EMAIL_PROVIDER`, `RESEND_*`, `SMTP_*` vars
- `.env.example` — add new vars with comments
- `src/app/api/auth/signup/route.ts` — wire email send
- `src/app/api/auth/resend-verification/route.ts` — wire email send
- `src/app/api/auth/invite/route.ts` — replace hardcoded NoOp with factory
- `src/testing/infrastructure/env.ts` — add new fields

## Packages to Install

- `resend` — Resend SDK
- `nodemailer` — SMTP transport
- `@types/nodemailer` — TypeScript types

## Readiness Checklist

- [x] `EmailService` interface already exists and is provider-agnostic
- [x] `NoOpEmailService` already exists
- [x] Factory pattern established in `src/modules/feature-flags/factory.ts`
- [x] Signup and resend-verification routes already create tokens
- [x] 1086 tests passing, typecheck + lint clean (baseline)
