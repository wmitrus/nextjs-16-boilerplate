# Implementation Report

## Task

`2026-04-22-forgot-password-email`

## Scope Implemented

The missing password-reset email wiring was added for the AuthJS forgot-password flow.

Implemented scope, based on the task intake and final validation artifacts:

- extend the `EmailService` contract with `sendPasswordResetEmail`
- implement `sendPasswordResetEmail` in all supported adapters
- wire the forgot-password route to create the email service and send the reset email after token creation
- preserve the existing dev bypass path where `AUTH_EXPOSE_RESET_TOKEN_IN_DEV=true`

## Files Changed

Expected / task-documented implementation surface:

- `src/modules/invitations/domain/EmailService.ts`
- `src/modules/invitations/infrastructure/resend/ResendEmailService.ts`
- `src/modules/invitations/infrastructure/smtp/NodemailerEmailService.ts`
- `src/modules/invitations/infrastructure/NoOpEmailService.ts`
- `src/app/api/auth/forgot-password/route.ts`

## Logic Changes

### 1. EmailService Contract Extended

The domain email contract now supports password reset delivery in addition to the pre-existing email flows.

### 2. Adapter Coverage Added

All configured email adapters implement the new password-reset delivery method so the route can stay provider-agnostic.

### 3. Forgot-Password Route Wired

After generating and persisting the reset token, the route now:

- creates the email service using the existing factory pattern
- constructs a server-owned reset URL
- sends the password-reset email through the selected provider

### 4. Existing Security / UX Behavior Preserved

- user-enumeration-safe response shape remains unchanged
- dev bypass still returns early without sending email
- provider selection stays behind the factory abstraction

## Tests / Validation Impact

No new E2E automation was added for this task. Validation relied on:

- `pnpm typecheck`
- `pnpm lint --fix`
- `pnpm test`

All passed, as recorded in `validation-report.md`.

## Status

- [x] Implementation complete
- [x] Validation complete
- [x] Final architecture check complete
