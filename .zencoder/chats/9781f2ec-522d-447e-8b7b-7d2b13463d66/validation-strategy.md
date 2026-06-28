# Validation Strategy

## Task

`2026-04-22-forgot-password-email`

## Minimum Required Validation

### 1. TypeScript Typecheck

```shell
pnpm typecheck
```

- **Why**: Confirms all three adapters implement the new `sendPasswordResetEmail` method
- **Signal strength**: High — compiler enforces interface contract

### 2. Lint

```shell
pnpm lint --fix
```

- **Why**: Catches import order, SEC-10 pattern (no raw error objects), formatting
- **Note**: Always `--fix`, never plain lint

### 3. Unit Tests

```shell
pnpm test
```

- **Why**: Ensures existing 1102 tests still pass after interface change
- **Signal strength**: Medium — no new unit tests needed for this change (email send is a side effect, not pure logic)

## Optional Additional Validation

### Integration / Manual Dev Verification

- Set `AUTH_EXPOSE_RESET_TOKEN_IN_DEV=false` and `EMAIL_PROVIDER=none`
- Submit forgot-password form
- Confirm `[NoOpEmailService] Password reset email (not sent):` is logged to console with `to` and `resetUrl`

### Manual Resend Verification (requires live Resend account)

- Set `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL=<verified-email>`
- Submit forgot-password form with the verified email
- Confirm email received in inbox

## Validation Not Required

- E2E Playwright spec — email delivery requires live infra, not suitable for automated E2E
- Integration DB test — token creation already tested by existing test suite
- New unit test for route handler — the missing email call is not exercised by unit tests (side effect)

## Validation Gaps Acknowledged

- No automated validation for Resend API success path — requires live credentials
- Email template HTML is inline (not tested for rendering) — deferred per scope

## Commands Summary

```shell
pnpm typecheck
pnpm lint --fix
pnpm test
```
