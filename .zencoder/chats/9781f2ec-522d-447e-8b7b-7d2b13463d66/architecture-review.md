# Architecture Review

## Task

`2026-04-22-forgot-password-email` — Add `sendPasswordResetEmail` to EmailService and wire forgot-password route

## Summary

**Classification**: Minor interface extension + route wiring. No structural change.

## Architectural Fit

The change is fully consistent with existing architecture:

- `EmailService` is a provider-agnostic interface in `src/modules/invitations/domain/`
- Three implementations follow the same shape: `ResendEmailService`, `NodemailerEmailService`, `NoOpEmailService`
- The route calls `createEmailService(opts)` directly from `env` — same pattern as `/api/auth/signup/route.ts`
- No new modules, no new DI registrations, no new boundary crossings

## Affected Layers and Modules

| Layer                   | File                                                                    | Change                                                    |
| ----------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------- |
| Domain contract         | `src/modules/invitations/domain/EmailService.ts`                        | Add `sendPasswordResetEmail` method                       |
| Infrastructure - Resend | `src/modules/invitations/infrastructure/resend/ResendEmailService.ts`   | Implement method                                          |
| Infrastructure - SMTP   | `src/modules/invitations/infrastructure/smtp/NodemailerEmailService.ts` | Implement method                                          |
| Infrastructure - NoOp   | `src/modules/invitations/infrastructure/NoOpEmailService.ts`            | Implement stub                                            |
| Route Handler           | `src/app/api/auth/forgot-password/route.ts`                             | Wire `createEmailService` + call `sendPasswordResetEmail` |

## Dependency Direction

- The route handler imports `createEmailService` from `src/modules/invitations/infrastructure/EmailServiceFactory` — consistent with how `signup/route.ts` does it
- No reverse dependencies introduced
- Module boundary: `invitations` module owns the email domain contract — correct, as password reset is still an email delivery concern

## Required New Contracts

- `SendPasswordResetEmailInput` interface in `EmailService.ts`:
  ```typescript
  export interface SendPasswordResetEmailInput {
    readonly to: string;
    readonly resetUrl: string;
  }
  ```

## Boundary Risks

**None identified.** The change is additive — a new method on an existing interface. All existing callers unaffected.

## Provider Isolation

- All three adapters must implement the new method — TypeScript will enforce this at compile time
- `NoOpEmailService` logs to console (dev stub pattern)
- No provider-specific concepts leak into the contract

## Architecture Constraints

1. Do NOT move `sendPasswordResetEmail` to a different interface — keep it in `EmailService` (same interface, same domain boundary)
2. Do NOT register EmailService in the DI container for this route — use direct factory call like signup route
3. Do NOT call email service in the dev bypass path (`AUTH_EXPOSE_RESET_TOKEN_IN_DEV=true`) — that path early-returns intentionally

## Status

- [x] Complete — no architectural blockers
