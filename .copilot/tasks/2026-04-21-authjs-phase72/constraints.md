# Constraints — Phase 7.2 AuthJS Email Verification + Brute Force

**Consolidated from**: Security & Auth, Architecture Guard, Next.js Runtime specialist summaries
**Date**: 2026-04-21
**Status**: FINALIZED

---

## Hard Constraints (Non-Negotiable)

### Runtime

- C-RT-1: `export const dynamic` and `export const runtime` are **BANNED** in all route segments — `cacheComponents: true` is active
- C-RT-2: `await connection()` must be the **first statement** in every new route handler and async RSC page content component
- C-RT-3: `searchParams` must be typed as `Promise<{...}>` and awaited inside the async content component
- C-RT-4: All new async RSC page content components must be wrapped in `<Suspense fallback={null}>`
- C-RT-5: `await ctx.params` is required in the NextAuth route handler modification (Next.js 16 App Router)

### Security

- C-SEC-1: **Never issue a full JWT session to an unverified user** — `authorize()` must throw `EmailNotVerified` when `emailVerified === false`
- C-SEC-2: Verification tokens: `crypto.randomBytes(32).toString('base64url')` — SHA-256 hash stored, raw token never persisted (SEC-06)
- C-SEC-3: All resend/forgot endpoints must return 200 regardless of email existence (user-enumeration safety)
- C-SEC-4: `AUTH_DEV_AUTO_VERIFY=true` must be **impossible in production** — validated at T3-Env startup
- C-SEC-5: `AUTH_EXPOSE_VERIFICATION_TOKEN_IN_DEV` only active when `NODE_ENV !== 'production'`
- C-SEC-6: Never log raw token values — log only `userId` and event name (SEC-10)
- C-SEC-7: Rate limit on sign-in must include `meta: { path }` (SEC-17)
- C-SEC-8: Rate limit on resend-verification must include `meta: { path }` (SEC-17)

### Database

- C-DB-1: New migration `when` value must be > `1776770000000` — use `1776860000000`
- C-DB-2: `email_verification_tokens` table FK references `usersReferenceTable` from `@/core/db/schema/references`
- C-DB-3: Token atomicity: delete existing pending tokens for user before inserting new one
- C-DB-4: Mark `used_at = NOW()` before returning success (single-use enforcement)

### Module Boundaries

- C-MOD-1: `email_verification_tokens` table belongs in `src/modules/auth/infrastructure/drizzle/schema.ts`
- C-MOD-2: No business logic in `src/shared/*`
- C-MOD-3: All new route handlers follow `src/app/api/auth/{action}/route.ts` pattern
- C-MOD-4: All new pages follow `src/app/auth/{flow}/page.tsx` + client component pattern

---

## Architecture Decisions (Locked)

- D-1: Email verification policy = **strict block** — no full session for unverified users
- D-2: Verification flow throw: `throw new Error('EmailNotVerified')` in `authorize()` (same pattern as `NoCredentials`)
- D-3: Token table = `email_verification_tokens` (separate from `password_reset_tokens`)
- D-4: Token expiry = **24 hours**
- D-5: After successful verification → redirect to `/auth/signin?verified=true` (no auto-sign-in)
- D-6: Brute-force = dual-key rate limit in `src/app/api/auth/[...nextauth]/route.ts` wrapper; credential callback only; keys: `signin:ip:${ip}` AND `signin:identifier:${sha256(lowercase(trim(email)))}` — block on either
- D-7: Session invalidation after password reset = **DEFERRED** — documented as known limitation
- D-8: Dev bypass = `AUTH_DEV_AUTO_VERIFY` env var, gated on `NODE_ENV !== 'production'`
- D-9: `NoCredentials` sign-in message changed to generic "Incorrect email or password." (removes medium enumeration signal)

---

## Environment Variables (New, Required)

| Variable                                 | Schema                                                       | Default (server) | Default (testing) | Notes                                                 |
| ---------------------------------------- | ------------------------------------------------------------ | ---------------- | ----------------- | ----------------------------------------------------- |
| `AUTH_DEV_AUTO_VERIFY`                   | `z.coerce.boolean().optional().default(false)`               | `false`          | `true`            | Set true in test env to enable signup→signin in tests |
| `AUTH_EXPOSE_VERIFICATION_TOKEN_IN_DEV`  | `z.coerce.boolean().optional().default(false)`               | `false`          | `false`           | Dev token in signup response                          |
| `AUTH_SIGN_IN_RATE_LIMIT_ATTEMPTS`       | `z.coerce.number().int().positive().optional().default(10)`  | `10`             | `10`              | Max attempts per IP per 15-min window                 |
| `AUTH_SIGN_IN_RATE_LIMIT_WINDOW_SECONDS` | `z.coerce.number().int().positive().optional().default(900)` | `900`            | `900`             | Window in seconds                                     |

**T3-Env production validation**: If `AUTH_DEV_AUTO_VERIFY === true` AND `NODE_ENV === 'production'`, throw startup error.

---

## Known Limitation (Documented Debt)

**Session invalidation after password reset**:
JWT `maxAge` is currently **30 days** (`auth.config.ts`). Password reset does not invalidate active sessions. An attacker with a stolen session token retains access until the JWT expires. Mitigations:

- Short-term: Production deployments should configure a shorter `maxAge` (recommendation: 1 hour with rolling)
- Long-term: Implement `sessionVersion` tracking in `user_credentials` + JWT callback DB validation (future task)

This is a documented residual risk. It is acceptable for the boilerplate at this stage.

---

## What Changes Relative to Phase 7.1

| Area                           | Before                               | After                                                                                                             |
| ------------------------------ | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `email_verified` lifecycle     | Always `false`; never checked        | Set `false` on signup; set `true` only on token verification                                                      |
| `authorize()` — verified check | Not enforced                         | Throws `EmailNotVerified` if `emailVerified === false`                                                            |
| Signup flow                    | Signs user in automatically          | Redirects to `/auth/verify-email-pending` with NO email in query string (or to sign-in if `AUTH_DEV_AUTO_VERIFY`) |
| Brute force                    | No protection                        | IP-based rate limit at NextAuth callback handler                                                                  |
| `NoCredentials` message        | Revealed social-provider distinction | Generic "Incorrect email or password."                                                                            |
| Session invalidation           | No                                   | Deferred with documentation                                                                                       |

---

## Corrections Added — 2026-04-21 (User Review)

### C-SEC-9: Dual-Key Sign-In Rate Limiting (REQUIRED)

Sign-in rate limiting MUST use both keys — block if either is exceeded:

- `signin:ip:${ip}` — protects against per-IP exhaustion
- `signin:identifier:${sha256(lowercase(trim(email)))}` — protects against credential stuffing via rotating IPs

IP-only is insufficient for production. Single-key implementations are rejected.

### C-SEC-10: `AUTH_EXPOSE_VERIFICATION_TOKEN_IN_DEV` Runtime Guard

Both conditions must be checked inline at the exact point where `devToken`/`devVerifyUrl` are returned:

```typescript
const exposeDevToken =
  env.NODE_ENV !== 'production' &&
  env.AUTH_EXPOSE_VERIFICATION_TOKEN_IN_DEV === true;
```

Startup validation alone is not sufficient. The runtime guard is mandatory at every callsite.

### C-SEC-11: No Email in `/auth/verify-email-pending` Query String

Email must NOT appear in the URL query string for `/auth/verify-email-pending`. It lands in browser history, server logs, analytics, and referrer headers. The page shows a generic "Check your inbox" message. The resend form contains an email input field — user re-enters their email.

### C-DB-5: Verification Token Consumption Must Be Atomic (DB Transaction)

The following three operations must execute in a single DB transaction:

1. Check token hash exists, `expires_at > now()`, `used_at IS NULL`
2. `UPDATE email_verification_tokens SET used_at = NOW() WHERE id = ?`
3. `UPDATE user_credentials SET email_verified = TRUE WHERE user_id = ?`

Partial state (token consumed, user not verified) is not acceptable.

### D-10 (updated): Session Invalidation Deferral Scope

Session invalidation is deferred for **this rollout only** (signup → verify → first sign-in scope). It is NOT acceptable as a permanent state for future flows:

- Email change
- Re-verification
- Admin forced unverify
- Security incident flows

A dedicated future task is required before any of those flows are implemented.

---

## Corrections Added — Round 2 (2026-04-21)

### C-DB-6: Atomic Token Consume — UPDATE WHERE used_at IS NULL RETURNING (REQUIRED)

The token verification sequence MUST be:

```sql
-- Step 1 (the gate — atomic, single winner under concurrent requests):
UPDATE email_verification_tokens
  SET used_at = NOW()
  WHERE token_hash = $hash AND expires_at > NOW() AND used_at IS NULL
  RETURNING user_id;

-- If 0 rows returned: diagnostic read only (no writes):
SELECT used_at, expires_at FROM email_verification_tokens WHERE token_hash = $hash LIMIT 1;
-- → not found → INVALID; used_at IS NOT NULL → ALREADY_USED; expires_at <= now → EXPIRED

-- If 1 row returned: continue within same transaction:
-- Step 2:
UPDATE user_credentials SET email_verified = TRUE WHERE user_id = $userId;
```

**SELECT → UPDATE is banned.** It is a TOCTOU race: two concurrent requests with the same token can both pass the SELECT check and both execute the UPDATE. The `UPDATE WHERE used_at IS NULL RETURNING` pattern is the only correct approach — DB serialises the concurrent writes; exactly one wins.

### C-EMAIL-1: Email Delivery — Variant B (No Mailer Yet)

Email delivery does not exist in this codebase (only `NoOpEmailService`). This is a **production deployment blocker** for the verification flow.

**Rule**: `REGISTRATION_MODE=closed` is REQUIRED in production until a real email adapter is implemented.

The UI phrase "Check your inbox" is acceptable only in dev/staging. It is NOT acceptable in production when nothing is sent.

This plan does NOT implement email delivery. That is a future task.

### C-ENV-1: No Dead Configuration (AUTH*SIGN_IN_RATE_LIMIT*\* Removed)

`AUTH_SIGN_IN_RATE_LIMIT_ATTEMPTS` and `AUTH_SIGN_IN_RATE_LIMIT_WINDOW_SECONDS` are removed from this plan.

`checkRateLimit()` initialises Upstash `Ratelimit` at module load time from `API_RATE_LIMIT_REQUESTS` / `API_RATE_LIMIT_WINDOW`. It accepts no per-call overrides. Adding env vars the helper ignores is dead configuration and is rejected.

Sign-in rate limiting uses the global limits via dedicated prefix keys: `signin:ip:${ip}` and `signin:identifier:${hash}`.

### C-BYPASS-1: Dev Bypass Naming — Auto-Verify, Not Auto-Login

`AUTH_DEV_AUTO_VERIFY=true` means: **email is marked verified at signup time in the DB**. It does NOT mean the user is automatically signed in. After signup, the user is redirected to `/auth/signin` and must sign in explicitly.

This distinction must be consistent across: code comments, test descriptions, log messages, and all documentation. The phrase "dev auto-verify" is correct. The phrase "dev bypass skips login" is incorrect and forbidden.

---

## Corrections Added — Round 3 (2026-04-21)

### C-COPY-1: Capability-Aware Copy — No "Sent Email" / "Check Your Inbox" Without Mailer

All user-facing strings in this feature must not claim that an email was sent when no email delivery exists.

**Banned** (when mailer is not implemented):

- "We've sent a verification email."
- "Check your inbox and spam folder."
- "a new verification link has been sent"

**Required** (capability-aware):

- Signup 201 response: `"Account created. Email verification is required before sign-in."`
- Verify-email-pending page: `"Your account requires email verification before sign-in."`
- Resend SAFE_RESPONSE: `"If verification delivery is enabled and the account exists, a new verification step has been created."`

Copy claiming email delivery is only acceptable after a real email adapter is implemented and verified.

### C-CONFIG-1: Hard Config Invariant — REGISTRATION_MODE=open Requires a Delivery Path

`validateVerificationConfig()` (scoped to `AUTH_PROVIDER=authjs`) enforces:

1. Both `AUTH_DEV_AUTO_VERIFY=true` and `AUTH_EXPOSE_VERIFICATION_TOKEN_IN_DEV=true` simultaneously → startup error (config clarity)
2. `NODE_ENV=production` + `REGISTRATION_MODE=open` → startup error (no email delivery)
3. `NODE_ENV !== production` + `REGISTRATION_MODE=open` + neither bypass flag → startup error (dead-end signup)
4. `NODE_ENV=production` + any bypass flag `true` → startup error (bypass banned in production)

Without this invariant, a misconfigured environment allows users to sign up but never verify — permanently blocked.

### C-TX-2: Signup Transaction Covers All Four Inserts

For the `AUTH_DEV_AUTO_VERIFY=false` path, a single `db.transaction()` wraps:

1. `INSERT INTO users`
2. `INSERT INTO user_credentials` (`emailVerified: false`)
3. `INSERT INTO auth_user_identities`
4. `INSERT INTO email_verification_tokens`

This prevents the partial state: account created + credentials inserted + token creation failed. The existing route already uses a transaction for the first three; the token insert joins it.

### C-ENV-2: Bypass Scope Is Development/Test Only — Not Staging

`AUTH_DEV_AUTO_VERIFY` and `AUTH_EXPOSE_VERIFICATION_TOKEN_IN_DEV` are **development/test only**. "Staging" is explicitly excluded. Preview deployments and shared non-prod environments must not expose raw verification tokens. Any environment that is publicly accessible or shared must be treated as production for these flags.

---

## Corrections Added — Round 4 (2026-04-21) — Final Approval

### C-TX-3: Resend Token Replacement Must Be Atomic

The resend flow writes two things: DELETE old pending tokens + INSERT new token. These must be in a single `db.transaction()`.

**Why**: If DELETE succeeds and INSERT fails, the user is left with no active verification token — a worse state than they started in. Resend is a recovery path; it must not create a recovery-blocking partial state.

This is less critical than the verify-consume TOCTOU fix (C-DB-6), but is required for production-grade resilience.

### Approval Record

**Final approved state** (2026-04-21):

- Plan is production-safe within current operational scope: `AUTH_PROVIDER=authjs`, `REGISTRATION_MODE=closed` in production, no real email delivery yet
- Not approved as an open-registration production flow until a real email adapter is implemented
- All security-critical patterns confirmed: atomic token consumption, dual-key rate limiting, transactional writes, capability-aware copy, hard config invariants
