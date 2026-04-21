# Phase 2 — Implementation Plan

**Task ID**: `a1719b9e-1294-4faf-8749-219e4c080101`
**Date**: 2026-04-21
**Source**: `phase2-constraints.md`, specialist summaries
**Status**: Awaiting user approval

---

## Overview

This plan implements a production-ready, token-based password reset flow for the AuthJS adapter.
It simultaneously remediates the CRITICAL Phase 1 security vulnerability (unauthenticated set-password)
and adds proper UX (always-visible "Forgot password?" link).

The flow works without email infrastructure in development (dev token returned in API response).
Email delivery is explicitly deferred and will slot in cleanly when email infrastructure is available.

---

## User Flow After Implementation

```
Sign-in page
  [Email]
  [Password]
  [Forgot password?]  ← always visible below password field
  [Sign In]
  Don't have an account? Sign up

Forgot Password page (/auth/forgot-password)
  [Email input]
  [Send Reset Link]
  → API returns 200 always (no enumeration)
  → In dev: devToken shown in success state / console
  → In prod: email sent (when email infra available)

Reset Password page (/auth/reset-password?token=xxx)
  → Validates token on page load (via API call on submit)
  [New Password]
  [Confirm New Password]
  [Reset Password]
  → On success: redirect to /auth/signin
  → On invalid/expired token: error with link to /auth/forgot-password
```

---

## Implementation Sequence

### Step A — Remove insecure set-password (immediate, no dependencies)

- Delete `src/app/api/auth/set-password/route.ts`
- Delete `src/app/auth/set-password/page.tsx`
- Delete `src/app/auth/set-password/set-password-client.tsx`
- Remove `/auth/set-password` from `AUTH_ROUTE_PREFIXES` in `src/security/middleware/route-policy.ts`
- Add `/auth/reset-password` to `AUTH_ROUTE_PREFIXES` in `src/security/middleware/route-policy.ts`

### Step B — DB schema + migration (depends on: Step A complete)

- Add `passwordResetTokensTable` to `src/modules/auth/infrastructure/drizzle/schema.ts`
- Run `pnpm db:generate` to generate the migration SQL
- Migration file will be created automatically in `src/core/db/migrations/generated/`

### Step C — Forgot Password API (depends on: Step B)

Create `src/app/api/auth/forgot-password/route.ts`:

- `await connection()` first
- Guard: `AUTH_PROVIDER !== 'authjs'` → 404
- Rate limit: `checkRateLimit(ip, { path: pathname })` → 429 if exceeded (SEC-J + SEC-17)
- Parse body → validate email with Zod
- Look up user by email — if not found, still return 200 (no enumeration)
- If found: generate raw token (`crypto.randomBytes(32)` → base64url), compute `SHA256(rawToken)`
- Delete any existing unexpired tokens for this user (cleanup-on-write)
- Insert `passwordResetTokensTable` row: `{ userId, tokenHash, expiresAt: now + 15min }`
- Log `{ event: 'auth:reset_token_created', tokenId: row.id }` (never the raw token)
- In `NODE_ENV === 'development'`: include `devToken` in response for testing
- Always return `200 { message: 'If an account with this email exists, a reset link has been sent.' }`

### Step D — Reset Password API (depends on: Step B)

Create `src/app/api/auth/reset-password/route.ts`:

- `await connection()` first
- Guard: `AUTH_PROVIDER !== 'authjs'` → 404
- Parse body → validate `{ token: string (min 1), password: string (min 8) }` with Zod
- Compute `SHA256(token)`
- Look up `passwordResetTokensTable` by `tokenHash`
- Validate: row exists, `expiresAt > now`, `usedAt IS NULL`
- If any check fails → 410 `{ error: 'This password reset link is invalid or has expired. Please request a new one.' }` (same message for all failure modes)
- Fetch user from `usersTable` by `userId`
- Hash new password with bcrypt cost 12
- In a transaction:
  - Set `passwordResetTokensTable.usedAt = NOW()` (mark token used FIRST)
  - Upsert `userCredentialsTable`: if exists → update `hashedPassword` + `updatedAt`; if not → insert (migration case)
  - Ensure `authUserIdentitiesTable(provider='authjs')` row exists for this user
- Log `{ event: 'auth:password_reset_success', userId }` (no token, no password)
- Return `200 { success: true }`

### Step E — Forgot Password page (depends on: Step C)

Modify `src/app/auth/forgot-password/page.tsx`:

- Replace the current placeholder with a proper server page following the sign-in page pattern
- `await connection()`, guard for `AUTH_PROVIDER`, redirect if already signed in
- Render `<ForgotPasswordClient />` inside Suspense boundary
  Create `src/app/auth/forgot-password/forgot-password-client.tsx`:
- Email form → POST to `/api/auth/forgot-password`
- On success: show "If an account with this email exists, a reset link has been sent."
- In dev mode: show `devToken` in a dev-only info box (gated on `process.env.NODE_ENV === 'development'`)
- On 429: show "Too many requests. Please wait before trying again."

### Step F — Reset Password page (depends on: Step D)

Create `src/app/auth/reset-password/page.tsx`:

- Follows existing page pattern: Suspense > inner async > `await connection()` > guard > read `searchParams`
- Passes `token` from searchParams to `<ResetPasswordClient token={token} />`
  Create `src/app/auth/reset-password/reset-password-client.tsx`:
- Shows "New Password" + "Confirm Password" fields
- Receives `token` as a prop
- On submit: POST `{ token, password }` to `/api/auth/reset-password`
- On success: "Password reset successfully! Redirecting to sign in…" → redirect `/auth/signin`
- On 410: "This link is invalid or has expired." with link to `/auth/forgot-password`
- If no token prop: show "No reset token provided." with link to `/auth/forgot-password`

### Step G — Sign-in UX update (independent, no dependencies)

Modify `src/app/auth/signin/sign-in-client.tsx`:

- Add always-visible "Forgot password?" link below the password field label, styled as a secondary
  small link (right-aligned alongside the label or below it)
- Update `NoCredentials` error message: change from "This account was set up with a different
  sign-in method. Please set a password to continue." to "Incorrect email or password. If you
  forgot your password, use the Forgot password link below."
- Remove the `errorCode === 'NoCredentials'` conditional set-password link block
- Remove `errorCode` state (no longer needed for conditional rendering — "Forgot password?" is always visible)

### Step H — Unit tests (depends on: Steps C, D)

Add or update test files:

- `src/app/api/auth/forgot-password/route.test.ts` — cover: invalid body, rate limited (mocked), email not found (200), email found (201 + token in dev), token generation happy path
- `src/app/api/auth/reset-password/route.test.ts` — cover: invalid body, missing token, expired token, used token, invalid token, success (updates password), success (creates credentials for migrated user)
- Update `src/app/auth/signin/sign-in-client.test.tsx` — verify "Forgot password?" link always present
- Update `src/app/auth/set-password/` tests → DELETE (files removed)

### Step I — Final validation

```shell
pnpm typecheck
pnpm lint --fix
pnpm test
```

All 1059 existing tests must still pass. New route tests must pass. Coverage thresholds ≥ 75%.

---

## File Change Summary

| File                                                              | Action                                                   |
| ----------------------------------------------------------------- | -------------------------------------------------------- |
| `src/app/api/auth/set-password/route.ts`                          | **DELETE**                                               |
| `src/app/auth/set-password/page.tsx`                              | **DELETE**                                               |
| `src/app/auth/set-password/set-password-client.tsx`               | **DELETE**                                               |
| `src/modules/auth/infrastructure/drizzle/schema.ts`               | **MODIFY** — add `passwordResetTokensTable`              |
| `src/core/db/migrations/generated/XXXX_password_reset_tokens.sql` | **GENERATE** via `pnpm db:generate`                      |
| `src/app/api/auth/forgot-password/route.ts`                       | **CREATE**                                               |
| `src/app/api/auth/reset-password/route.ts`                        | **CREATE**                                               |
| `src/app/auth/forgot-password/page.tsx`                           | **MODIFY** — replace placeholder                         |
| `src/app/auth/forgot-password/forgot-password-client.tsx`         | **CREATE**                                               |
| `src/app/auth/reset-password/page.tsx`                            | **CREATE**                                               |
| `src/app/auth/reset-password/reset-password-client.tsx`           | **CREATE**                                               |
| `src/app/auth/signin/sign-in-client.tsx`                          | **MODIFY** — always-visible forgot link, updated message |
| `src/security/middleware/route-policy.ts`                         | **MODIFY** — remove set-password, add reset-password     |
| `src/app/api/auth/forgot-password/route.test.ts`                  | **CREATE**                                               |
| `src/app/api/auth/reset-password/route.test.ts`                   | **CREATE**                                               |

---

## Risk Assessment

| Risk                                                                                     | Severity | Mitigation                                                                       |
| ---------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------- |
| `pnpm db:generate` may conflict with existing migration if schema drift exists           | Medium   | Run `pnpm db:dev:reset && pnpm db:dev:migrate` after generation if needed        |
| Rate limiting on forgot-password requires Upstash — dev/test may have different behavior | Low      | Tests mock `checkRateLimit()`                                                    |
| Dev token returned in response could leak if NODE_ENV check is wrong                     | Medium   | Strict `env.NODE_ENV === 'development'` check, never a string literal comparison |
| `SHA-256` is sync in Node `crypto` — acceptable at low volume; no async needed           | Info     | N/A                                                                              |

---

## User Decisions (Confirmed 2026-04-21)

| Decision                       | Choice                                                                                                                                                                                    |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dev-mode token surface         | **Both UI + server log** — gated on `NODE_ENV !== 'production'` AND `AUTH_EXPOSE_RESET_TOKEN_IN_DEV=true`. Not shown on Vercel preview.                                                   |
| Reset password page validation | **Validate on page load** (RSC queries DB for token validity + masked email). Show `wo***@example.com` if valid. Full re-validation on submit (token may expire between load and submit). |
| NoCredentials error message    | **Generic** — `'Incorrect email or password.'` with always-visible "Forgot password?" link. No provider type disclosure.                                                                  |

### Additional env var required: `AUTH_EXPOSE_RESET_TOKEN_IN_DEV`

- Optional boolean, defaults to `false`
- Must be added to `src/core/env.ts`
- Guard pattern: `env.NODE_ENV !== 'production' && env.AUTH_EXPOSE_RESET_TOKEN_IN_DEV === true`

### Reset-password page load validation approach

- RSC page: `await connection()` → resolve DB via DI → compute `SHA256(token)` → query token table → pass `{ tokenValid, maskedEmail }` to client
- Masked email format: `wo***@example.com` (first 2 chars + `***` + `@domain`)
- If invalid on load: show "This link is invalid or has expired." with link to `/auth/forgot-password`
- If valid: show form with "Resetting password for wo\*\*\*@example.com"
- On submit: full re-validation in the API (atomically)

---

## ✅ APPROVED — Proceeding to Implementation — User Review Required

**Do not implement until the user explicitly approves this plan.**

Questions for user:

1. Do you want the dev-mode `devToken` shown in the UI (forgot-password success state) OR only in server logs? UI is easier for testing; logs are more production-like.
2. Should the reset-password page show a preview of which email will be reset (fetched via a separate server check), or just show the password form immediately and let the API validate the token?
3. For the `NoCredentials` sign-in error — should it be completely generic ("Incorrect email or password") or slightly more helpful ("Account exists but requires password reset") to guide Clerk-migrated users without disclosing provider type?
