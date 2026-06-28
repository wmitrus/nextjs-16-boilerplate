# 02 - Security & Auth - Summary

## Task Context

- **Task ID**: `2026-04-21-authjs-phase72`
- **Task Objective**: Security audit of three remaining auth gaps; define requirements for email verification, brute-force protection, and session invalidation
- **Current Run Scope**: Phase 7.2 — full security review of all three gaps + validation of user's strict email verification policy
- **Status**: COMPLETED
- **Last Updated**: 2026-04-21
- **Related Control Artifacts**: `plan.md`, `intake.md`
- **Leantime Task**: #69

---

## Scope Handled

- **Auth surfaces reviewed**: `authorize()` in `auth.ts`, NextAuth route handler, signup route, email_verified lifecycle
- **Gaps audited**: Gap 1 (email verification), Gap 2 (brute-force), Gap 3 (session invalidation after password reset)
- **Policy reviewed**: User's strict email verification model (pasted input)
- **Prior phase constraints carried in**: Phase 2 Security & Auth Summary (`02 - Security & Auth - Summary.md` in `.zencoder/chats/a1719b9e-1294-4faf-8749-219e4c080101/`)

---

## Inputs Reviewed

- `src/modules/auth/infrastructure/authjs/auth.ts` — `authorize()`, JWT/session callbacks
- `src/modules/auth/infrastructure/drizzle/schema.ts` — DB schema
- `src/app/api/auth/[...nextauth]/route.ts` — NextAuth route handler wrapper
- `src/app/api/auth/forgot-password/route.ts` — rate-limit + token pattern reference
- `src/shared/lib/network/get-ip.ts` — IP extraction helper
- `src/security/middleware/route-policy.ts` — route protection
- `src/core/env.ts` — existing env var definitions
- User policy input: strict email verification model

---

## Gap 1 — Email Verification Flow

### Findings

**Current state**: `email_verified` is always `false` in `user_credentials`; `authorize()` reads the value into JWT but does not enforce it. Any user who signs up can immediately sign in with full app access regardless of email ownership.

**Trust boundary violation**: Full JWT sessions are issued to users whose email ownership has not been verified. This affects password reset safety, organization invite security, audit attribution, and billing ownership.

### Policy Validation — User's Strict Model

The user's proposed policy is **correct and adopted as the security requirement for this task**:

> "An email address is not a trusted identity until verification succeeds. Unverified users may exist, but they do not receive a full authenticated session."

**Approved**: Three-state model — `PENDING_VERIFICATION`, `VERIFIED`, (and `SUSPENDED` optionally later).

**Approved**: Unverified users get no normal JWT session — only access to verification-related pages.

**Approved**: Dev-mode bypass via `AUTH_DEV_AUTO_VERIFY` env flag — strictly gated on `NODE_ENV !== 'production'`.

**Rejected**: Silent auto-verification in production. If email infrastructure is not ready, set `REGISTRATION_MODE=closed` — do not pretend emails are verified.

### Implementation Requirements

#### R-EV-1: No session for unverified users

`authorize()` MUST throw `new Error('EmailNotVerified')` when password is correct but `email_verified === false` (and `AUTH_DEV_AUTO_VERIFY !== true`).

**Why throw rather than return null?** Throwing allows the sign-in client to distinguish the `EmailNotVerified` case from "wrong password" (`null` → generic `CredentialsSignin` error). This pattern is already established for `NoCredentials`. The error message maps to actionable UI — not a generic failure.

**Why not issue a restricted JWT?** Option B (restricted JWT with middleware redirect) risks accidental bypass if route-policy is incomplete or has edge cases. The trust boundary must be at the session issuance layer, not at the routing layer. A route-policy redirect is defense-in-depth, not the primary enforcement.

#### R-EV-2: Verification token table

New table `email_verification_tokens` (separate from `password_reset_tokens`). Same pattern:

```
id           uuid       PK, defaultRandom()
user_id      uuid       FK → users.id, CASCADE DELETE
token_hash   text       NOT NULL, UNIQUE
expires_at   timestamptz NOT NULL
used_at      timestamptz nullable
created_at   timestamptz NOT NULL, defaultNow()
```

Indexes: `user_id`, `token_hash`.

**Rationale for separate table**: Clear schema ownership per concern; no type-discriminator complexity; consistent with `password_reset_tokens` pattern already in codebase.

#### R-EV-3: Token security

- Generation: `crypto.randomBytes(32).toString('base64url')` — SEC-06 compliant
- Storage: `SHA-256(rawToken)` hex digest — raw token never persisted
- Expiry: **24 hours** (industry standard; 48h acceptable but 24h is safer default)
- Single-use: mark `used_at = NOW()` atomically on first valid consumption
- Single token per user: delete existing pending tokens before inserting new one (same pattern as password reset)

#### R-EV-4: Dev-mode bypass

- New env var: `AUTH_DEV_AUTO_VERIFY` — `z.coerce.boolean().optional().default(false)`
- Guard at T3-Env schema level: if `AUTH_DEV_AUTO_VERIFY === true && NODE_ENV === 'production'` → validation error (fail-fast at startup)
- On signup with `AUTH_DEV_AUTO_VERIFY=true`: insert `user_credentials` with `emailVerified: true`; skip token creation
- Log as `WARN` when bypass is active: `[DEV ONLY] email_verified bypass active — AUTH_DEV_AUTO_VERIFY=true`
- Mirror in `src/testing/infrastructure/env.ts`: `AUTH_DEV_AUTO_VERIFY: false` (default for tests)

#### R-EV-5: Token exposure for dev/test (no email infra)

New env var: `AUTH_EXPOSE_VERIFICATION_TOKEN_IN_DEV` — `z.coerce.boolean().optional().default(false)` — same pattern as `AUTH_EXPOSE_RESET_TOKEN_IN_DEV`.

On signup (with `NODE_ENV !== 'production' && AUTH_EXPOSE_VERIFICATION_TOKEN_IN_DEV === true`): return `devToken` and `devVerifyUrl` in signup API response and log as `WARN`.

This enables full E2E and manual testing of the verification flow without email infrastructure.

#### R-EV-6: Resend verification endpoint

`POST /api/auth/resend-verification`:

- Accepts: `{ email }`
- Rate limit: max 3 per email per hour (Upstash, same pattern as forgot-password)
- Always returns 200 (user-enumeration safe)
- If user already verified: return 200 silently (no action, no disclosure)
- If user not found: return 200 silently
- If user unverified: delete existing pending token, create new one, log event

#### R-EV-7: Verification page

`GET /auth/verify-email?token=<rawToken>`:

- Server component loads, passes token to server action or reads searchParams
- Token validation: compute SHA-256, look up in table, check `expires_at` > now, check `used_at IS NULL`
- On success: set `email_verified = true` in `user_credentials`, mark `used_at`, redirect to sign-in with success message
- On failure (expired/used/invalid): show appropriate error with resend link

#### R-EV-8: Signup UX change

After successful signup: redirect to `/auth/verify-email-pending` page (or pass `?email=...`) showing "Check your email" message. Do NOT sign the user in automatically after signup.

#### R-EV-9: Duplicate signup before verification

If user re-submits signup with same email and `email_verified = false`:

- Return `409` with message: "An account with this email exists. Check your inbox to verify, or sign in if you already verified."
- Do NOT create a duplicate account.
- Do NOT automatically resend verification (to prevent abuse).

---

## Gap 2 — Brute-Force Protection on Sign-In

### Findings

**Current state**: `authorize()` has no rate limiting. An attacker with a known email address can attempt unlimited passwords. The NextAuth route handler also has no pre-flight rate checking.

### Layer Decision: Route Handler Wrapper

**Recommendation: Rate limit in `src/app/api/auth/[...nextauth]/route.ts` wrapper — targeting credential sign-in POST only.**

**Rationale**:

- The wrapper has a full `NextRequest` object with standard `headers` API — identical to how `forgot-password` uses `getIP`
- We can precisely target credential sign-in by checking `params.nextauth`:
  - `['callback', 'credentials']` — credential authentication callback (the actual auth call)
- Other NextAuth endpoints (session, CSRF, sign-out) are NOT rate-limited — correct
- Keeps `authorize()` focused on authentication logic only (separation of concerns)
- Same `checkRateLimit + getIP` pattern as all other protected routes — no new abstractions

**Against Option B (inside authorize())**:

- `authorize()` receives `req` as `IncomingMessage`-like — header access is less ergonomic
- Mixing rate-limit infrastructure into the credential authorize callback adds concerns to auth.ts
- The route handler wrapper is the correct integration point

**Against Option C (both proxy + authorize())**:

- Redundant complexity for a boilerplate
- `src/proxy.ts` rate limiting on all `/api/auth/...` traffic would need careful exclusion logic
- Route handler wrapper is more precise and sufficient

### Implementation Requirements

#### R-BF-1: IP-based rate limit at route handler wrapper

In `src/app/api/auth/[...nextauth]/route.ts`:

```typescript
// Only rate-limit credential sign-in POST requests
const resolvedParams = await ctx.params;
const isCredentialSignIn =
  req.method === 'POST' &&
  resolvedParams.nextauth[0] === 'callback' &&
  resolvedParams.nextauth[1] === 'credentials';

if (isCredentialSignIn) {
  const ip = await getIP(req.headers);
  const rateLimitResult = await checkRateLimit(`signin:ip:${ip}`, {
    path: '/api/auth/signin',
  });
  if (!rateLimitResult.success) {
    return new Response(
      JSON.stringify({
        error: 'Too many sign-in attempts. Please try again later.',
      }),
      {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
}
```

#### R-BF-2: Rate limit configuration

New env vars (with sensible defaults, no Upstash change needed — uses existing `checkRateLimit` which already uses the configured Upstash instance):

| Env Var                                  | Default | Meaning                        |
| ---------------------------------------- | ------- | ------------------------------ |
| `AUTH_SIGN_IN_RATE_LIMIT_ATTEMPTS`       | `10`    | Max attempts per IP per window |
| `AUTH_SIGN_IN_RATE_LIMIT_WINDOW_SECONDS` | `900`   | Window in seconds (15 min)     |

**Note**: `checkRateLimit` currently uses the global Upstash rate limit config (from `API_RATE_LIMIT_*`). For simplicity, use a prefixed key `signin:ip:${ip}` and let Architecture Guard determine whether a dedicated rate limiter instance is needed or the shared one is sufficient.

#### R-BF-3: Rate limit response

Return `429` with `Content-Type: application/json` body — not an HTML redirect. The sign-in client must handle this gracefully (map to user-facing message).

**Security note**: The 429 response does NOT reveal whether the email is valid or invalid. It applies to all credential sign-in attempts from the IP regardless of email — this is correct and does not add enumeration risk.

---

## Gap 3 — Session Invalidation After Password Reset

### Findings

**Current state**: JWT tokens have a fixed `maxAge` (default: 30 days or as configured). Resetting a password via `/api/auth/reset-password` does not invalidate active JWT sessions. An attacker who obtained a session token retains access until the token expires naturally.

### Recommendation: Defer with Explicit Documentation

**Decision: Defer to a follow-up task. Document as a known security limitation.**

**Rationale**:

1. Fixing this properly requires `sessionVersion` (or `tokenVersion`) in `user_credentials` + DB query on every JWT validation
2. Every JWT callback invocation (not just on sign-in — also on every Next.js server-side render that checks session) would incur a DB round-trip
3. This is a significant architectural change that deserves its own design task
4. The attack vector is narrow: requires an attacker to have obtained a valid session token BEFORE the password was reset
5. Email verification (Gap 1) and brute-force protection (Gap 2) address the more immediate risks
6. A short JWT `maxAge` (e.g., 1 hour with rolling) would substantially mitigate the risk without DB overhead

**Immediate mitigation** (to implement now as part of this task): Ensure `NEXTAUTH_JWT_MAX_AGE` is documented with a short recommended value (e.g., 1 hour). Check the current `maxAge` configuration and document it in the architecture notes.

**Required documentation**: A `constraints.md` entry and `SECURITY_CODING_PATTERNS.md` note that session invalidation is pending. The residual risk must be explicitly recorded.

---

## Trust Boundary Summary

| Layer                                        | Enforcement                                   |
| -------------------------------------------- | --------------------------------------------- |
| `authorize()` — password check               | Existing ✅                                   |
| `authorize()` — email verified check         | **New R-EV-1**                                |
| `authorize()` — NoCredentials check          | Existing ✅                                   |
| Route handler — brute force rate limit       | **New R-BF-1**                                |
| Verification token — hash stored, single-use | **New R-EV-3**                                |
| Dev bypass — env-gated, production-banned    | **New R-EV-4**                                |
| Session invalidation after password reset    | **Deferred — documented as known limitation** |

---

## Security Decisions / Constraints

### Approved Requirements

1. `EmailNotVerified` throw from `authorize()` when email not verified (same pattern as `NoCredentials`)
2. `email_verification_tokens` table — separate from `password_reset_tokens`; same schema pattern
3. Token: `crypto.randomBytes(32)` → `base64url` → SHA-256 stored (SEC-06 compliant)
4. Token expiry: 24 hours; single-use; one active token per user (delete old on resend)
5. Dev bypass: `AUTH_DEV_AUTO_VERIFY` — T3-Env validated against `NODE_ENV === 'production'`
6. Dev token exposure: `AUTH_EXPOSE_VERIFICATION_TOKEN_IN_DEV` — same pattern as password reset
7. Resend endpoint: public, rate-limited (3/hour/email), user-enumeration safe (200 always)
8. Brute-force: IP-based rate limit in NextAuth route handler wrapper, credential-callback-only
9. Session invalidation: **deferred** — short `maxAge` as interim mitigation; documented as known limitation

### Rejected Directions

1. Restricted JWT session for unverified users → rejected (trust boundary must be at session issuance)
2. Auto-verification in production when email infra missing → rejected (use `REGISTRATION_MODE=closed`)
3. Brute-force rate limit inside `authorize()` → rejected (route handler is cleaner and more precise)
4. Account lockout (permanent) in this PR → out of scope (deferred)
5. Session invalidation via `sessionVersion` in this PR → deferred (own task)

---

## Sensitive Data Exposure Notes

- Verification tokens: never persisted raw; only SHA-256 hash in DB
- Dev token exposure: only when `NODE_ENV !== 'production' && AUTH_EXPOSE_VERIFICATION_TOKEN_IN_DEV === true`; logged as WARN
- Dev auto-verify bypass: logged as WARN on every signup where bypass is active
- Rate limit error responses: never reveal email validity
- Logger calls: no raw errors (SEC-10); no tokens; no hashed passwords

---

## New Environment Variables Required

| Variable                                 | Schema                                                       | Default | Notes                            |
| ---------------------------------------- | ------------------------------------------------------------ | ------- | -------------------------------- |
| `AUTH_DEV_AUTO_VERIFY`                   | `z.coerce.boolean().optional().default(false)`               | `false` | Dev bypass: banned in production |
| `AUTH_EXPOSE_VERIFICATION_TOKEN_IN_DEV`  | `z.coerce.boolean().optional().default(false)`               | `false` | Dev token in signup response     |
| `AUTH_SIGN_IN_RATE_LIMIT_ATTEMPTS`       | `z.coerce.number().int().positive().optional().default(10)`  | `10`    | Max attempts per IP per window   |
| `AUTH_SIGN_IN_RATE_LIMIT_WINDOW_SECONDS` | `z.coerce.number().int().positive().optional().default(900)` | `900`   | Window seconds                   |

**T3-Env production validation**: `AUTH_DEV_AUTO_VERIFY` must trigger a startup error if `true` in production. This is enforced in `validateAuthProviderConfigValues()` or a new `validateDevBypassConfig()` function.

---

## Open Questions for Architecture Guard

1. **`emailVerified` boolean on `user_credentials` vs separate table?** — Current design has `emailVerified: boolean` on `user_credentials`. This is correct and sufficient. No design change needed at the schema level (except adding the new `email_verification_tokens` table).

2. **After successful verification: which page?** → Architecture Guard to confirm UX flow:
   - Redirect to `/auth/signin` with `?verified=true` query param, or
   - Auto-sign-in (requires re-calling NextAuth), or
   - Redirect to a success page with "now sign in" link

3. **Verify-email page UX states**: Architecture Guard to define the four states:
   - Valid token → success
   - Already used → "already verified" (not an error)
   - Expired → "link expired" + resend option
   - Invalid (not found) → "invalid link" + resend option

4. **`/auth/verify-email-pending` page**: Is this a separate route or does `/auth/signup` do a client-side redirect with state? Architecture Guard to decide.

5. **JWT `maxAge` configuration**: Confirm current value; Architecture Guard to decide whether to enforce a short max-age as interim session invalidation mitigation.

---

## Handoff Notes

- **Architecture Guard must**: Design `email_verification_tokens` table boundaries, API route structure, page structure, UX state machine for verification, confirm brute-force rate limit implementation in route handler wrapper
- **Do not re-decide**: Email verification policy is strict (block unverified); `EmailNotVerified` throw is the correct pattern; brute-force goes in route handler wrapper
- **Next specialist**: Architecture Guard

---

## Update Log

### 2026-04-21 — Phase 7.2 Security Review

- Scope: All three auth gaps; user's strict email verification policy
- Summary: All three gaps analyzed; requirements defined; Gap 3 deferred with documentation
- Decisions: Strict email verification adopted; brute-force in route handler; session invalidation deferred

---

## Update Log (continued)

### 2026-04-21 — User Review Corrections Applied

User reviewed implementation plan and required four corrections before approval. All accepted and applied:

| Correction                                                                                                 | Security Ruling                                                                                                               | Status                                                                     |
| ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Remove raw email from `/auth/verify-email-pending` query string                                            | Privacy + log hygiene — URL params land in browser history, analytics, referrers                                              | ✅ Applied — page shows generic message; resend form has email input field |
| Replace IP-only brute force with dual-key: IP + `sha256(normalized_email)`                                 | IP-only is insufficient — rotating IPs bypass; shared NAT is collateral damage; credential stuffing requires identifier limit | ✅ Applied — both keys required; block on either                           |
| Clean Phase E-1 contradiction: no `POST /api/auth/verify-email`; RSC page handles verification server-side | Correctness — plan had conflicting decisions in same section                                                                  | ✅ Applied — single final decision: RSC page only                          |
| DB transaction mandatory for token consume + set `email_verified=true`                                     | Atomicity — partial state (token consumed, user not verified) is a trust boundary gap                                         | ✅ Applied — single transaction for check + mark used + set verified       |
| `AUTH_EXPOSE_VERIFICATION_TOKEN_IN_DEV` runtime guard (both conditions at point of use)                    | Defense in depth — startup validation alone is insufficient; runtime guard prevents bypass if startup is skipped              | ✅ Applied as additional recommendation                                    |

**Session invalidation deferral scope clarification**: Approved for this rollout only (signup → verify → first sign-in). Not acceptable as permanent state for email change, re-verification, admin forced unverify, or security incident flows. Future task required before those flows.
