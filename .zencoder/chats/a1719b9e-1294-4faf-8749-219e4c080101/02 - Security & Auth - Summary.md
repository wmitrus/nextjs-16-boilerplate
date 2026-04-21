# 02 - Security & Auth - Summary

## Task Context

- **Task ID**: `a1719b9e-1294-4faf-8749-219e4c080101`
- **Task Objective**: Implement production-ready password reset flow for AuthJS adapter; remediate Phase 1 critical security vulnerability
- **Current Run Scope**: Phase 2 — full security review of Phase 1 implementation; define correct password reset requirements
- **Status**: COMPLETED
- **Last Updated**: 2026-04-21
- **Related Control Artifacts**: `plan.md`, `validation-report.md`

---

## Scope Handled

- **Auth surfaces reviewed**: `/api/auth/set-password`, `/api/auth/signup`, `authorize()` in `auth.ts`, sign-in client error handling
- **Authorization surfaces reviewed**: All new auth API routes from Phase 1
- **Trust-boundary questions in scope**: Can an unauthenticated caller mutate another user's credentials?

---

## Inputs Reviewed

- **Code paths reviewed**:
  - `src/app/api/auth/set-password/route.ts` (Phase 1, now flagged CRITICAL)
  - `src/app/api/auth/signup/route.ts`
  - `src/modules/auth/infrastructure/authjs/auth.ts` (`authorize()`)
  - `src/app/auth/signin/sign-in-client.tsx`
  - `src/modules/auth/infrastructure/drizzle/schema.ts`
- **Security docs reviewed**: `docs/ai/general/SECURITY_CODING_PATTERNS.md`

---

## Current-State Findings

### 🔴 CRITICAL — `/api/auth/set-password`: Unauthenticated Account Takeover

**Severity**: CRITICAL
**Location**: `src/app/api/auth/set-password/route.ts`
**Classification**: CWE-620 Unverified Password Change / CWE-287 Improper Authentication

**Description**: The endpoint accepts `{ email, password }` from any unauthenticated caller. It checks
only that the target user has NO existing `user_credentials` row. For the entire population of
Clerk-migrated users (i.e., every user currently in the database), this check passes. An attacker who
knows any valid email address (from any source: leaked DB, social engineering, common patterns) can:

1. POST `{ "email": "victim@example.com", "password": "attacker-chosen-password" }` to `/api/auth/set-password`
2. Endpoint creates a `user_credentials` row with the attacker's chosen password
3. Attacker signs in as the victim at `/auth/signin`

**This is a complete, unrestricted account takeover for all Clerk-migrated users.**

The "no existing credentials" guard does not protect against this attack — it was intended as a safe
guard for already-migrated users, but it actually selects exactly the vulnerable population.

**Required action**: Remove this endpoint and its associated page immediately. Do not attempt to patch
it with rate limiting or any other guard — there is no safe version of an unauthenticated
password-setting endpoint.

---

### 🔴 CRITICAL — User Enumeration via `/api/auth/forgot-password` Placeholder Response

**Severity**: HIGH
**Location**: Current `/auth/forgot-password` page (Phase 1)
**Classification**: CWE-200 Exposure of Sensitive Information

**Description**: When implementing the proper forgot-password endpoint, the API response MUST be
identical regardless of whether the submitted email exists in the database. Any difference (status
code, response body, or timing) allows an attacker to enumerate which email addresses have accounts.

**Required pattern**:

```typescript
return Response.json(
  {
    message:
      'If an account with this email exists, a reset link has been sent.',
  },
  { status: 200 },
);
```

This must be returned for BOTH valid and invalid emails.

---

### 🟡 MEDIUM — NoCredentials Error Leaks Account Existence

**Severity**: MEDIUM
**Location**: `src/modules/auth/infrastructure/authjs/auth.ts` `authorize()`
**Classification**: CWE-200 Account Enumeration

**Description**: When `authorize()` throws `new Error('NoCredentials')`, the sign-in UI displays a
specific message: "This account was set up with a different sign-in method." This reveals that:

- The email address submitted is registered in the system
- The account was provisioned via a social provider (not credentials)

An attacker can probe the sign-in endpoint to enumerate which email addresses have accounts, and
specifically which ones are Clerk-migrated (potentially higher-value targets).

**Severity assessment**: MEDIUM, not CRITICAL, because:

- Most login forms have some degree of enumeration (e.g., "account not found" vs "wrong password")
- The information revealed (email exists, no password) is not directly exploitable without the reset vulnerability
- After the set-password endpoint is removed, the leak does not enable immediate exploitation

**Mitigation options**:

- **Option A (recommended for now)**: Keep the `NoCredentials` distinction but change the UI message
  to something that doesn't reveal provider type. Example: "Incorrect email or password. If you
  forgot your password, use the Forgot Password link." — This removes provider-type disclosure while
  still being actionable.
- **Option B (stricter)**: Return `null` from `authorize()` for all failures and rely solely on the
  "Forgot password?" link for self-service recovery. Loses no real functionality.

The Security Agent recommends **Option A** as the appropriate balance for a boilerplate.

---

### 🟢 ACCEPTABLE — Sign-up 409 Duplicate Email Message

**Severity**: INFO / ACCEPTABLE
**Location**: `src/app/api/auth/signup/route.ts`

The message "An account with this email already exists." on 409 is standard UX. Some strict
implementations prefer identical responses for all sign-up attempts to prevent email enumeration.
For a boilerplate where registration is behind `REGISTRATION_MODE=open`, this is acceptable.

---

## Trust Boundary Assessment

- **Where identity is established**: Session token via NextAuth JWT; `getServerSession()` in RSC/handlers
- **Where authorization is enforced**: Not applicable to public auth routes (signup/signin/forgot-password/reset-password)
- **Where tenant or org context is derived**: N/A for auth flows
- **What claims or inputs are trusted**: Email input from user — MUST NOT be trusted to authorize credential mutation without a verified token chain

---

## Security Requirements for Password Reset

### Correct Architecture: Token-Based Email Verification

**Step 1 — Forgot Password Request**

- User submits email on `/auth/forgot-password`
- Server: generates `crypto.randomBytes(32)` → base64url-encode → raw token
- Server: computes `SHA-256(rawToken)` → stores `tokenHash` in `password_reset_tokens` table
- Server: sends email with link `/auth/reset-password?token=<rawToken>`
- Server: always returns `200 { message: 'If an account exists, a reset link has been sent.' }`
- Rate limit: max 3 requests per email per 15 minutes

**Step 2 — Reset Password**

- User arrives at `/auth/reset-password?token=<rawToken>`
- Server: decodes token, computes SHA-256, looks up `tokenHash` in table
- Validates: `tokenHash` exists, `expiresAt` not passed (15-minute window), `usedAt` IS NULL
- User submits new password
- Server: updates `user_credentials` hashedPassword, sets `usedAt = NOW()`, logs event
- Server: creates `user_credentials` if none exists (migration case — safe because token was delivered to the email owner)

### DB Schema — `password_reset_tokens`

```
id           uuid       PK, defaultRandom()
user_id      uuid       FK → users.id, CASCADE DELETE
token_hash   text       NOT NULL, UNIQUE
expires_at   timestamp  NOT NULL (withTimezone)
used_at      timestamp  (nullable, withTimezone)
created_at   timestamp  NOT NULL, defaultNow()
```

Index: `user_id`, `token_hash`

### Development Mode

When `NODE_ENV=development`, the reset token MAY be returned in the response body to allow
testing without email infrastructure. This MUST be gated on `NODE_ENV === 'development'` strictly
and never present in production responses.

### Token Security Requirements

- Token: `crypto.randomBytes(32)` → URL-safe base64 → 43 chars (not `Math.random()` — SEC-06)
- Storage: only the SHA-256 hash, never the raw token
- Expiry: 15 minutes
- Single-use: mark `usedAt` immediately on first successful validation
- Cleanup: expired + used tokens can be deleted on next request (or via scheduled job)

---

## Sensitive Data And Exposure Notes

- Tokens in transit are only in the email link — never in API response bodies (except dev mode)
- Token hashes in DB are not reversible to raw tokens
- `hashedPassword` is bcrypt-hashed at cost 12 — acceptable
- Logger calls must not log raw tokens, email+token combinations, or the hash (audit trail: log `tokenId` only)

---

## Security Decisions / Constraints

### Approved Controls

1. Token-based reset with SHA-256 stored hash (not raw token)
2. User-enumeration-safe response for forgot-password API
3. `crypto.randomBytes(32)` for token generation (SEC-06 compliant)
4. 15-minute token expiry
5. Single-use enforcement via `usedAt` column
6. Development-mode raw token in response (gated on `NODE_ENV === 'development'`)
7. Rate limiting on forgot-password endpoint

### Rejected Directions

1. **Unauthenticated set-password** — BANNED. No version of this is safe.
2. **Security question verification** — Outdated, not appropriate.
3. **Admin-only set-password endpoint** — Out of scope for Phase 2; requires admin auth layer.
4. **Returning user-enumeration signals from forgot-password** — BANNED.

### Required Enforcement Points

- Forgot-password API must return 200 regardless of email existence
- Reset-password API must validate token hash, expiry, and used status in a single atomic check
- Token must be invalidated on first successful use
- Rate limiting must be applied to forgot-password endpoint

---

## Open Questions / Blockers

- **Email infrastructure**: Full production flow requires SMTP/SendGrid/Resend. For Phase 2, implement
  the full flow with dev-mode token return. Email sending is a follow-up step.
- **Token cleanup**: Recommend a DB-level scheduled cleanup or cleanup-on-read. Can be deferred.
- **NoCredentials message**: Architecture Guard should confirm whether Option A or B is preferred for UX.

---

## Handoff Notes

- **Architecture Guard must**: Design `password_reset_tokens` table placement (auth module schema),
  confirm API route structure, confirm page structure, and address sign-in UX ("Forgot password?" link placement)
- **Do not re-decide**: Token-based email verification is the only acceptable pattern. Unauthenticated
  set-password is categorically rejected.
- **Next specialist**: Architecture Guard, then Runtime Agent

---

## Update Log

### 2026-04-21 — Phase 2 Security Review

- Trigger: Phase 1 `set-password` endpoint flagged as CRITICAL security vulnerability
- Summary: Full audit completed; CRITICAL finding documented; requirements for correct token-based reset defined
- Sections refreshed: All
