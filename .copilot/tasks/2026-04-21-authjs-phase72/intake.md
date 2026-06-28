# Intake — Phase 7.2: AuthJS Security Validation + Email Verification + Brute Force

**Task workspace**: `.copilot/tasks/2026-04-21-authjs-phase72/`
**Leantime task ID**: #69
**Status**: ✅ COMPLETE
**Date**: 2026-04-21

---

## Objective

Complete the security hardening of the AuthJS credential auth adapter by implementing the three remaining high-risk gaps identified in the Phase 7.1 handoff:

1. **Email verification flow** — strict policy: unverified users blocked from full sign-in
2. **Brute-force protection** — rate limiting on sign-in attempts
3. **Session invalidation after password reset** — decide and implement or formally defer

Plus: Playwright E2E specs for all auth pages (Pattern F — required before PR).

---

## Requirements

### Functional

- R1: On sign-up, create account with `email_verified=false`; send verification email
- R2: Verify email via token link; on success set `email_verified=true`
- R3: `authorize()` must check `email_verified`; unverified users blocked from full session
- R4: Unverified users must be able to: resend verification, change email, sign out
- R5: Brute-force protection on `POST /api/auth/[...nextauth]` (credentials authorize flow)
- R6: Password reset must not silently leave old sessions valid (decide: implement or document)

### Security

- S1: Strict policy — `PENDING_VERIFICATION` state does not receive a normal JWT session
- S2: Verification tokens: `crypto.randomBytes(32)`, SHA-256 stored, 24–48h expiry, single-use
- S3: Brute-force: rate limit by IP and/or email; configurable via env vars
- S4: Dev-mode bypass for email verification (`AUTH_DEV_AUTO_VERIFY`) — strictly env-gated, impossible in production
- S5: No silent auto-verification in production
- S6: Resend verification — rate-limited, user-enumeration safe

### Non-Goals

- Google OAuth / social login
- TOTP / 2FA
- Magic links
- Account lockout (permanent, not temporary throttle)
- Full email delivery infrastructure (can use dev-mode token exposure pattern from Phase 2)

---

## Acceptance Criteria

- [x] `email_verified` is set to `true` only after successful token verification
- [x] Sign-in with unverified email returns a non-normal-session state (no app access)
- [x] Verification page shows appropriate UI based on token validity
- [x] Resend verification endpoint exists and is rate-limited
- [x] Brute-force protection active on sign-in: too many failed attempts → throttled
- [x] `AUTH_DEV_AUTO_VERIFY=true` bypasses verification only in `NODE_ENV !== 'production'`
- [x] All new routes covered by unit tests
- [x] 1059+ tests passing, coverage maintained ≥ 75%
- [x] Typecheck clean, lint clean
- [x] Playwright E2E specs exist for: sign-in, sign-up, forgot-password, reset-password, verify-email

---

## Scope and Non-Goals

**In scope:**

- `email_verification_tokens` DB table + migration
- `POST /api/auth/verify-email` — token validation endpoint
- `GET /auth/verify-email` — verification page (success/failure/expired states)
- `POST /api/auth/resend-verification` — resend endpoint (rate-limited)
- Brute-force rate limiting on credentials sign-in
- `authorize()` modification to check `email_verified`
- Sign-in UX: "verify your email" state
- Sign-up UX: "check your email" redirect after signup
- `AUTH_DEV_AUTO_VERIFY` env var + dev bypass
- Session invalidation decision (implement `sessionVersion` or formally document as debt)
- Playwright E2E specs for all 5 auth pages

**Out of scope:**

- Email delivery (Resend/SendGrid) — dev-mode token in logs/response (same pattern as password reset)
- Google OAuth
- TOTP / 2FA

---

## Source Materials

| Source                                | Location                                                                                    |
| ------------------------------------- | ------------------------------------------------------------------------------------------- |
| Handoff document                      | `.zencoder/chats/a1719b9e-1294-4faf-8749-219e4c080101/HANDOFF-NEXT-CHAT.md`                 |
| Phase 2 security summary              | `.zencoder/chats/a1719b9e-1294-4faf-8749-219e4c080101/02 - Security & Auth - Summary.md`    |
| Phase 2 architecture summary          | `.zencoder/chats/a1719b9e-1294-4faf-8749-219e4c080101/01 - Architecture Guard - Summary.md` |
| Phase 2 runtime summary               | `.zencoder/chats/a1719b9e-1294-4faf-8749-219e4c080101/03 - Next.js Runtime - Summary.md`    |
| DB schema                             | `src/modules/auth/infrastructure/drizzle/schema.ts`                                         |
| Authorize function                    | `src/modules/auth/infrastructure/authjs/auth.ts`                                            |
| Forgot-password (rate-limit pattern)  | `src/app/api/auth/forgot-password/route.ts`                                                 |
| Reset-password (atomic token pattern) | `src/app/api/auth/reset-password/route.ts`                                                  |
| Env schema                            | `src/core/env.ts`                                                                           |
| Test env                              | `src/testing/infrastructure/env.ts`                                                         |
| Route policy                          | `src/security/middleware/route-policy.ts`                                                   |
| Migration journal                     | `src/core/db/migrations/generated/meta/_journal.json`                                       |
| User policy input                     | `/tmp/zencoder/pasted/files/20260421130005-e6n53k.txt`                                      |

---

## Environment Variables (New, Required)

| Variable                           | Type      | Default | Purpose                                                  |
| ---------------------------------- | --------- | ------- | -------------------------------------------------------- |
| `AUTH_DEV_AUTO_VERIFY`             | `boolean` | `false` | Dev bypass: auto-verify email on signup (banned in prod) |
| `AUTH_SIGN_IN_RATE_LIMIT_ATTEMPTS` | `number`  | `5`     | Max sign-in attempts per window                          |
| `AUTH_SIGN_IN_RATE_LIMIT_WINDOW`   | `number`  | `900`   | Window in seconds (15 min)                               |

---

## Open Questions (For Security & Auth Agent)

1. **Email verification — restricted session vs no session?**
   - Option A: No session at all — redirect to `/auth/verify-email-pending` page, no JWT issued
   - Option B: Restricted JWT with `emailVerified: false` claim — route-policy blocks access to app
   - Which is safer? Which is more compatible with NextAuth v4 JWT model?

2. **Brute-force layer — proxy vs authorize()?**
   - Option A: Rate limit in `src/proxy.ts` for `/api/auth/[...nextauth]` route (all credentials requests)
   - Option B: Rate limit inside `authorize()` function via Upstash (same pattern as forgot-password)
   - Option C: Both — proxy for IP, authorize() for email-based
   - Recommendation?

3. **Session invalidation — implement now or defer?**
   - `sessionVersion` approach: add column to `user_credentials`, increment on reset, JWT callback validates
   - Cost: DB query on every JWT callback validation
   - Is this required for PR? Or acceptable as documented debt?

4. **Verification token expiry**: 24h? 48h? (Phase 2 used 15 min for password reset tokens)

5. **Resend verification — cooldown?** Rate limit: max 3 resends per email per hour?

---

## Readiness Checklist

- [x] Baseline passing (1059 tests, typecheck clean, lint clean)
- [x] Phase 2 constraints known and documented
- [x] DB migration structure understood (journal `when` format)
- [x] User policy input reviewed (strict verification model)
- [x] Security & Auth specialist sign-off completed before architecture design
- [x] Architecture Guard design completed before runtime review
- [x] Runtime review completed before implementation plan

## Completion Note

- Repository artifacts and validation confirm task completion.
- Leantime task `#69` is already closed with status `Zrobione (0)`.
- Session invalidation after password reset remains intentionally documented as deferred debt, not unfinished work for this task.

---

## Known Constraints Carried In

1. `cacheComponents: true` → `export const dynamic` / `export const runtime` banned
2. `await connection()` required before `getAppContainer()` in RSC
3. Rate-limit calls: always pass `meta: { path }` (SEC-17)
4. Never log raw errors — `errorMessage` / `errorName` fields only (SEC-10)
5. `crypto.randomBytes(32)` for tokens (SEC-06)
6. New migration `when` > `1776770000000`
7. Token pattern: store SHA-256 hash only
8. `pnpm lint --fix` (not plain lint)
