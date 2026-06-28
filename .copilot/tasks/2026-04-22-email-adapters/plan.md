# Phase 8 — Email Adapters (Resend + Nodemailer/SMTP)

## Status: COMPLETE

- [x] Task workspace created
- [x] Intake created
- [x] Packages installed: `resend`, `nodemailer`, `@types/nodemailer`
- [x] `EmailService` interface extended with `sendVerificationEmail`
- [x] `NoOpEmailService` updated with stub implementation
- [x] `ResendEmailService` implemented (Resend API, HTML templates)
- [x] `NodemailerEmailService` implemented (Nodemailer SMTP transport)
- [x] `EmailServiceFactory` implemented — `createEmailService(opts)` factory, same pattern as `createFeatureFlagService`
- [x] Env vars added: `EMAIL_PROVIDER`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM_EMAIL`
- [x] `.env.example` updated with comments for all new vars
- [x] Routes wired: `signup`, `resend-verification`, `invite` — all use factory
- [x] `src/modules/invitations/index.ts` exports updated
- [x] `src/testing/infrastructure/env.ts` updated
- [x] Unit tests: factory (10 tests), ResendEmailService (4 tests), NodemailerEmailService (4 tests)
- [x] Validation gate: 1102 tests passing, typecheck clean, lint clean

## Validation Gate

- **Tests**: 1102 unit tests passing (up from 1086)
- **Typecheck**: ✅ clean
- **Lint**: ✅ clean
