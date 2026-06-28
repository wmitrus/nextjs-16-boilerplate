# Feature Constraints

## Task

`2026-04-22-forgot-password-email`

## Architecture Constraints

1. Add `sendPasswordResetEmail(input: SendPasswordResetEmailInput)` to `EmailService` interface in `src/modules/invitations/domain/EmailService.ts`
2. Add `SendPasswordResetEmailInput` interface: `{ readonly to: string; readonly resetUrl: string; }`
3. Implement in all three adapters — TypeScript compiler will enforce this
4. In the forgot-password route, use `createEmailService(opts)` directly (same pattern as signup route) — do NOT use DI container
5. Module boundary: email domain contract stays in `src/modules/invitations/domain/`

## Security Constraints

1. Reset URL must be server-constructed: `${env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/auth/reset-password?token=${rawToken}` — no user input in URL
2. Email send errors must NOT change the response shape — always return `SAFE_RESPONSE` (user enumeration protection)
3. SEC-10: When catching email send errors, extract `errorMessage` and `errorName` as separate string fields — never log raw `error` object
4. Dev bypass path (`AUTH_EXPOSE_RESET_TOKEN_IN_DEV=true`) must still early-return WITHOUT sending email — this is intentional
5. On email send failure, do NOT rollback the DB token — return `SAFE_RESPONSE` silently

## Runtime Constraints

1. `createEmailService(...)` must be called inside the route handler body (request time) — NOT at module level
2. No changes to `src/proxy.ts` needed
3. No `export const dynamic` or `export const runtime` — already correct
4. The `await connection()` call at the top of the route is already present — do not remove it

## Validation Constraints

- Run `pnpm typecheck` after implementation — TypeScript must catch any missing interface implementations
- Run `pnpm lint --fix` (not plain lint)
- Run unit test suite `pnpm test` — existing tests must continue passing
- No new E2E test required (email delivery requires live infra)

## Explicitly Allowed Changes

- `src/modules/invitations/domain/EmailService.ts` — add interface and method
- `src/modules/invitations/infrastructure/resend/ResendEmailService.ts` — add method
- `src/modules/invitations/infrastructure/smtp/NodemailerEmailService.ts` — add method
- `src/modules/invitations/infrastructure/NoOpEmailService.ts` — add stub method
- `src/app/api/auth/forgot-password/route.ts` — import `createEmailService`, build from `env`, call `sendPasswordResetEmail` after token creation

## Explicitly Forbidden Changes

- Do NOT add email sending to the `AUTH_EXPOSE_RESET_TOKEN_IN_DEV` dev bypass path
- Do NOT register `EmailService` in the DI container for this route
- Do NOT change the response shape on email error (user enumeration protection)
- Do NOT use `export const dynamic` or `export const runtime`
- Do NOT log raw error objects (SEC-10)
- Do NOT put user-controlled input into the reset URL

## Protected Invariants

- User enumeration protection: `SAFE_RESPONSE` always returned regardless of success/failure
- Dev bypass path: raw token exposed in response only when `AUTH_EXPOSE_RESET_TOKEN_IN_DEV=true` and `NODE_ENV !== 'production'`
- Rate limiting: already applied on IP + path — do not remove
- Token hash stored in DB; raw token only in email link
