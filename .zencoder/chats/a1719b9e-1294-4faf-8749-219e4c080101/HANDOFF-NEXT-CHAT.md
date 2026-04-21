# Phase 7.2 Handoff — AuthJS Auth: Security Validation + Email Verification + Brute Force Protection

**This document is the complete context brief for a new chat session.**
**Task directory**: `.zencoder/chats/a1719b9e-1294-4faf-8749-219e4c080101/`
**Prior plan**: `.zencoder/chats/a1719b9e-1294-4faf-8749-219e4c080101/plan.md` (all steps complete)

---

## Repository Context

Production-grade **Next.js 16 TypeScript modular monolith**. Always read `AGENTS.md` first.

Key constraints (from `AGENTS.md`):

- `cacheComponents: true` → `export const dynamic` and `export const runtime` are **banned** in route segments. Use `await connection()` from `next/server` to opt into dynamic rendering.
- `src/proxy.ts` is the middleware file — not `middleware.ts`
- Auth provider: `AUTH_PROVIDER=authjs` (`next-auth@4.24.14` + `bcryptjs`)
- DB: Drizzle ORM + `postgres-js` → `postgres://postgres:postgres@127.0.0.1:5432/app_dev`
- Migration runner: `drizzle-orm/postgres-js/migrator` — uses `when` field from `_journal.json` for ordering. **New migrations must have `when` > last migration's `when`** (0009 = `1776695066080`).
- Rate limiting: Upstash Redis — always pass `meta: { path }` to `checkRateLimit()`
- No `export const runtime` in route handlers — use `await connection()` instead

---

## Current Implementation State (Fully Validated ✅)

### What exists and works

| Feature                    | Files                                                                                |
| -------------------------- | ------------------------------------------------------------------------------------ |
| Sign-up (email + password) | `src/app/api/auth/signup/route.ts`, `src/app/auth/signup/page.tsx`                   |
| Sign-in (credentials)      | `src/modules/auth/infrastructure/authjs/auth.ts`, `src/app/auth/signin/page.tsx`     |
| Sign-out                   | Via NextAuth                                                                         |
| Forgot password            | `src/app/api/auth/forgot-password/route.ts`, `src/app/auth/forgot-password/page.tsx` |
| Reset password             | `src/app/api/auth/reset-password/route.ts`, `src/app/auth/reset-password/page.tsx`   |
| Session (JWT, no DB)       | `src/modules/auth/infrastructure/authjs/auth.ts` — JWT includes `emailVerified`      |
| Route protection           | `src/security/middleware/route-policy.ts`                                            |
| NoCredentials error        | `authorize()` throws `'NoCredentials'` → sign-in shows "Forgot password?" link       |

### DB Schema (auth module: `src/modules/auth/infrastructure/drizzle/schema.ts`)

```typescript
// user_credentials — one row per authjs user
userId: uuid PK FK→users.id
email: text UNIQUE NOT NULL
hashedPassword: text NOT NULL  // bcrypt cost 12
emailVerified: boolean NOT NULL DEFAULT false  // ← always false, never set to true
createdAt / updatedAt

// password_reset_tokens (migration 0010 — applied)
id: uuid PK
userId: uuid FK→users.id CASCADE
tokenHash: text UNIQUE NOT NULL  // SHA-256 of rawToken
expiresAt: timestamptz NOT NULL  // 15 min from creation
usedAt: timestamptz nullable    // set atomically when consumed
createdAt: timestamptz
```

### Key security properties of existing forgot/reset flow

- `forgot-password`: rate-limited (Upstash), always returns 200 (user-enumeration safe)
- `reset-password`: token validated atomically — `UPDATE SET used_at=now() WHERE used_at IS NULL AND expires_at > now()` returns 0 rows if already used or expired
- Token: `crypto.randomBytes(32)` → base64url (raw), SHA-256 stored — raw token never persisted
- `AUTH_EXPOSE_RESET_TOKEN_IN_DEV=true` in `.env.local` → dev reset URL returned in API response + logged as WARN

### Validation baseline (all passing before this task)

- **1059 unit tests**, typecheck clean, lint clean
- Coverage: 80.42%/76.03%/75.82%/80.57% (all ≥ 75%)

---

## What Is NOT Implemented — Ranked by Risk

### 🔴 HIGH — Security gaps requiring design + implementation

#### Gap 1: No email verification flow

- `user_credentials.email_verified` is **always `false`** — set on signup, never set to `true`
- `authorize()` does **not** block sign-in for unverified emails
- No verification email sent on signup
- No verification token table, no verification API route, no verification page
- The column, JWT field, and session shape all exist — only the flow is missing
- **Implication**: anyone can sign up with someone else's email and immediately sign in

#### Gap 2: No brute-force protection on sign-in

- NextAuth `authorize()` has no rate limiting
- Failed sign-in attempts are not tracked or throttled
- An attacker with a known email can try unlimited passwords with no friction

#### Gap 3: No session invalidation after password reset

- JWT sessions live in browser cookies — resetting a password does NOT invalidate existing sessions
- An attacker with a stolen session token retains access until the JWT max-age expires
- Fixing this properly requires DB-backed session tracking (significant architectural change)

### 🟡 MEDIUM — Needed before production, can defer from PR

| Gap                           | Detail                                                                        |
| ----------------------------- | ----------------------------------------------------------------------------- |
| Email delivery infrastructure | `forgot-password` only works in dev. Production needs Resend/SendGrid/SMTP.   |
| Expired token cleanup         | `password_reset_tokens` rows accumulate. No cron/cleanup job.                 |
| E2E Playwright specs          | Pattern F in `AGENTS.md` requires specs for all 4 auth pages before PR merge. |

### 🔵 Out of scope (intentionally deferred)

- Google OAuth / social login
- TOTP / 2FA
- Magic links
- Account lockout after N failed attempts (related to Gap 2 but distinct)

---

## Open Design Decisions (Require Specialist Input)

### Email Verification Design Questions

1. **Does unverified email block sign-in?** (strict — return error, user must verify first) or **lenient** (allow sign-in, show "please verify your email" banner)?
2. **When email infra doesn't exist yet**: treat signup as auto-verified (`emailVerified=true` on signup)? Or block sign-in and provide dev-mode bypass?
3. **Verification token storage**: new table `email_verification_tokens` (same pattern as `password_reset_tokens`) or reuse existing table with a `type` discriminator?
4. **Token expiry for email verification**: 24h? 48h? Resend allowed?
5. **What happens if user signs up again with same email before verifying?** Resend verification? Error?

### Brute Force Design Questions

1. **Rate limit at which layer?** In `authorize()` via Upstash (same pattern as `forgot-password`)? In `src/proxy.ts` for the `/api/auth/[...nextauth]` route? Both?
2. **What is the throttle policy?** IP-based? Email-based? Both? What limits?
3. **Does exceeding the limit lock the account** or just return 429?

### Session Invalidation Design Questions

1. **Is full JWT session invalidation required for this PR** or is it acceptable to document as a known limitation and defer?
2. If required: add `sessionVersion` to `user_credentials` table — increment on password reset — JWT validation compares stored version?

---

## Recommended Agent Sequence for New Chat

```
1. Security & Auth Agent     → audit all 3 gaps, define requirements
2. Architecture Guard        → design email verification flow, brute force layering, session strategy
3. Next.js Runtime Agent     → review new routes for runtime constraints
4. Orchestrator              → consolidate constraints.md + implementation-plan.md
   ⛔ PAUSE — user reviews implementation plan
5. Implementation Agent      → execute implementation-plan.md
6. Validation Agent          → pnpm typecheck && pnpm lint --fix && pnpm test
7. Playwright E2E Agent      → write specs for all auth pages
8. Leantime Integration      → close task
```

---

## Key Files to Read Before Starting

```
AGENTS.md                                                    ← always first
docs/ai/general/00 - Agent Interaction Protocol.md
docs/ai/general/SECURITY_CODING_PATTERNS.md
src/modules/auth/infrastructure/authjs/auth.ts               ← authorize(), session callbacks, JWT callbacks
src/modules/auth/infrastructure/drizzle/schema.ts            ← DB schema
src/app/api/auth/signup/route.ts                             ← signup handler
src/app/api/auth/forgot-password/route.ts                    ← forgot-password handler (rate-limited, user-enum safe)
src/app/api/auth/reset-password/route.ts                     ← reset-password handler (atomic token marking)
src/app/auth/signin/sign-in-client.tsx                       ← sign-in UX (NoCredentials handling)
src/security/middleware/route-policy.ts                       ← auth route prefixes
src/core/env.ts                                              ← T3-Env schema (add new vars here)
src/testing/infrastructure/env.ts                            ← test env defaults (mirror new vars here)
src/core/db/migrations/generated/meta/_journal.json          ← migration journal (when > 1776695066080 for new entries)
```

---

## Prior Task Artifacts (This Chat)

All artifacts are in `.zencoder/chats/a1719b9e-1294-4faf-8749-219e4c080101/`:

- `plan.md` — all steps complete
- `02 - Security & Auth - Summary.md` — Phase 2 security review
- `01 - Architecture Guard - Summary.md` — Phase 2 architecture review
- `03 - Next.js Runtime - Summary.md` — Phase 2 runtime review
- `phase2-constraints.md` — consolidated constraints
- `phase2-implementation-plan.md` — Phase 2 implementation plan (executed)
- `phase2-validation-report.md` — Phase 2 validation results

---

## Bugs Fixed in This Session (Do Not Re-Introduce)

| Bug                                                   | Root Cause                                                                                                                                                                        | Fix                                                                                                 |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `password_reset_tokens` DELETE error on first request | `_journal.json` entry 0010 had `when: 1745669400000` (April 2025) — before 0009's `when: 1776695066080`. Drizzle migrator skips migrations whose `when ≤ lastApplied.created_at`. | Updated entry 0010 `when → 1776770000000`.                                                          |
| Insecure set-password endpoint (CRITICAL — CWE-620)   | Unauthenticated POST accepting email + new password with no identity proof. Any caller knowing a valid email could take over the account.                                         | Deleted `src/app/api/auth/set-password/route.ts` and `src/app/auth/set-password/page.tsx` entirely. |

---

## Environment Variables Added in This Session

```bash
# .env.local — already set
AUTH_EXPOSE_RESET_TOKEN_IN_DEV=true   # exposes reset URL in API response (dev only)
```

```typescript
// src/core/env.ts — already registered
AUTH_EXPOSE_RESET_TOKEN_IN_DEV: z.coerce.boolean().optional().default(false);
// src/testing/infrastructure/env.ts — already registered
AUTH_EXPOSE_RESET_TOKEN_IN_DEV: false;
```

---

## What The User Confirmed Working (End-to-End Manual Test ✅)

1. Sign-up with new email + password → success, user created in DB
2. Sign-in with those credentials → authenticated session, email shown in nav
3. Sign-out → session cleared
4. Forgot password → form submitted → `auth:reset_token_created` in logs → dev amber panel shows clickable reset link
5. Reset password → server pre-validates token → shows masked email → new password set → `auth:password_reset_success` in logs → redirected to sign-in
6. Sign-in with new password → success
7. Full DB reset (`pnpm db:dev:reset && pnpm db:dev:migrate`) → all 11 migrations applied correctly
