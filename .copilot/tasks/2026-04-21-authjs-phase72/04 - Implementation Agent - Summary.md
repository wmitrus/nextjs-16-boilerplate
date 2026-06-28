# 04 - Implementation Agent Summary

## Task: 2026-04-21-authjs-phase72

**Status**: COMPLETE

## Phases Executed

### Phase A — Schema & Migration ✅

- `emailVerificationTokensTable` added to `src/modules/auth/infrastructure/drizzle/schema.ts`
- Migration `0011_email_verification_tokens.sql` applied via `pnpm db:dev:migrate`

### Phase B — Env Vars & Validation ✅

- `AUTH_DEV_AUTO_VERIFY` (boolean, default false) added to `src/core/env.ts`
- `AUTH_EXPOSE_VERIFICATION_TOKEN_IN_DEV` (boolean, default false) added
- `validateVerificationConfigValues()` exported — enforces:
  - Both flags simultaneously → error
  - Production + any bypass flag → error
  - Production + `REGISTRATION_MODE=open` → error
  - Non-production + open registration + no bypass → error
- `validateVerificationConfig()` convenience wrapper added
- `src/testing/infrastructure/env.ts` updated with both new fields

### Phase C — authorize() EmailNotVerified ✅

- `src/modules/auth/infrastructure/authjs/auth.ts` modified
- Throws `Error('EmailNotVerified')` when credentials match but `emailVerified === false`
- `EmailNotVerified` added to re-throw guard (alongside `NoCredentials`)

### Phase D — Brute-Force Rate Limiting ✅

- `src/app/api/auth/[...nextauth]/route.ts` rewritten
- Dual-key rate limiting for credentials callback:
  - `signin:ip:${ip}` key
  - `signin:identifier:${sha256(lowercase(trim(email)))}` key
- Both must succeed; if either fails → 429
- Request body cloned for email extraction before passing to NextAuth

### Phase E — Signup Route with Verification Token ✅

- `src/app/api/auth/signup/route.ts` rewritten
- `devAutoVerify` flag checked (`NODE_ENV !== 'production' && AUTH_DEV_AUTO_VERIFY === true`)
- Token generation inside existing `db.transaction()` (4th insert when not auto-verifying)
- Capability-aware messaging: no "sent email" / "check your inbox"
- Dev token exposure guard: `NODE_ENV !== 'production' && AUTH_EXPOSE_VERIFICATION_TOKEN_IN_DEV === true`
- Auto-verify path returns `"Account created. You can now sign in."`
- Normal path returns `"Account created. Email verification is required before sign-in."`

### Phase F — Resend Verification Route ✅

- Created `src/app/api/auth/resend-verification/route.ts`
- IP-based rate limit via `checkRateLimit()`
- Safe response for unknown email / already-verified user (no enumeration)
- Atomic `db.transaction()`: DELETE old pending tokens + INSERT new token
- Dev token exposure on resend when flag set
- Capability-aware safe response message

### Phase G — verify-email RSC Page (Atomic Consume) ✅

- Created `src/app/auth/verify-email/page.tsx`
- Atomic consume: `UPDATE WHERE tokenHash = ? AND expiresAt > NOW() AND usedAt IS NULL` → `RETURNING`
- Only if UPDATE returns 1 row: `UPDATE userCredentials SET emailVerified = true`
- Diagnostic read only on failure (TOCTOU-safe)
- States: `verified` → redirect to `/auth/signin?verified=true`; `already_used`, `expired`, `invalid`, `no_token` → error message + resend link

### Phase H — verify-email-pending Page ✅

- Created `src/app/auth/verify-email-pending/page.tsx` (RSC)
- Created `src/app/auth/verify-email-pending/verify-email-pending-client.tsx` (client resend form)
- No "check your inbox" copy — capability-aware message only
- Resend form takes email input, calls `POST /api/auth/resend-verification`
- Link to sign-in page

### Phase I — Route Policy ✅

- `src/security/middleware/route-policy.ts`: `/auth/verify-email` and `/auth/verify-email-pending` added to `AUTH_ROUTE_PREFIXES`

### Phase J — Sign-in Client Updates ✅

- `src/app/auth/signin/sign-in-client.tsx`: `EmailNotVerified` → redirect to `/auth/verify-email-pending`
- `verified` prop added; shows verified banner when `?verified=true` in URL
- `src/app/auth/signin/page.tsx`: passes `verified` param from searchParams
- `src/app/auth/signup/sign-up-client.tsx`: redirects to `/auth/verify-email-pending` after non-auto-verify signup

## Tests Added

| File                                                  | Tests                                                  |
| ----------------------------------------------------- | ------------------------------------------------------ |
| `src/core/env.test.ts`                                | +9 `validateVerificationConfigValues` tests            |
| `src/modules/auth/infrastructure/authjs/auth.test.ts` | +1 `EmailNotVerified` throw test                       |
| `src/app/api/auth/signup/route.test.ts`               | 10 tests (new)                                         |
| `src/app/api/auth/resend-verification/route.test.ts`  | 7 tests (new)                                          |
| `e2e/authjs-verify-email.spec.ts`                     | 10 E2E specs (authjs-only, skipped on other providers) |

## Validation Gate

- **1086 unit tests passing** (from 1059 baseline)
- **Coverage**: branches above 75% threshold ✅
- **Typecheck**: clean ✅
- **Lint**: clean ✅

## Known Gaps (Documented)

- **No real email delivery**: `NoOpEmailService` only — messaging reflects this
- **Session invalidation after password reset**: deferred (JWT sessions expire after maxAge)
- **`REGISTRATION_MODE=open` in production**: blocked by `validateVerificationConfig()` — requires closed registration until mailer exists
