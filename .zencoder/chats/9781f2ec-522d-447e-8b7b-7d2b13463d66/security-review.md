# Security Review

## Task

`2026-04-22-forgot-password-email` — Add `sendPasswordResetEmail` to EmailService and wire forgot-password route

## Summary

**Risk level**: Low. The token generation and storage is already implemented correctly (SHA-256, single-use, atomic). The missing piece is wiring the email send — which carries standard email delivery security considerations.

## Auth Surface

The forgot-password route is unauthenticated — any caller can submit an email. This is expected behavior.

## Existing Security Properties (Already Correct)

| Property                    | Status                                                                        |
| --------------------------- | ----------------------------------------------------------------------------- |
| User enumeration protection | ✅ Always returns safe message regardless of whether user exists              |
| Token generation            | ✅ `randomBytes(32).toString('base64url')` — cryptographically secure         |
| Token storage               | ✅ SHA-256 hash stored in DB, raw token only in email link                    |
| TOCTOU protection           | ✅ Atomic `DELETE + INSERT` in transaction                                    |
| Rate limiting               | ✅ `checkRateLimit` on IP with path propagation                               |
| Dev token exposure          | ✅ Gated behind `NODE_ENV !== 'production' && AUTH_EXPOSE_RESET_TOKEN_IN_DEV` |

## Security Constraints for New Code

### SEC-10 — Logger calls

When catching errors from `emailService.sendPasswordResetEmail()`, do NOT log the raw error:

```typescript
// ✅ Correct
logger.error(
  {
    event: 'auth:reset_email_error',
    errorMessage: error.message,
    errorName: error.name,
  },
  'Failed to send password reset email',
);
```

### Reset URL Construction

The `resetUrl` passed to the email template must be constructed server-side from `env.NEXT_PUBLIC_APP_URL`:

```typescript
const resetUrl = `${env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/auth/reset-password?token=${rawToken}`;
```

No user-controlled input must influence this URL.

### Dev Bypass Path

The `AUTH_EXPOSE_RESET_TOKEN_IN_DEV` branch must still early-return **without** sending email.
This is correct behavior — the token is exposed in the response for dev testing.
Do NOT add email sending to the dev bypass path.

### Email Error Handling — Do Not Leak Token

If email send fails, the route must still return the safe response (not expose which step failed):

```typescript
// ✅ Correct — safe response even on email error
return Response.json(SAFE_RESPONSE, { status: 200 });
```

Do NOT return a different error response that reveals whether the user exists or whether the token was created.

### Email Error — Do Not Delete Token

If email send fails, do NOT roll back the DB token. The token can still be used if the user tries again (resend flow), or the system admin can inspect logs.

## Applicable SECURITY_CODING_PATTERNS.md Rules

| ID     | Rule                                 | Applicability                         |
| ------ | ------------------------------------ | ------------------------------------- |
| SEC-10 | Never log raw `error` objects        | Apply when catching email send errors |
| SEC-17 | Pass `meta.path` to `checkRateLimit` | Already applied in the route          |

## Security Constraints

1. Reset URL must be server-constructed — no user input in URL
2. Email send errors must not change the response shape (user enumeration protection)
3. SEC-10 applies to email send error logging
4. Dev bypass must NOT send email

## Status

- [x] Complete — no security blockers
