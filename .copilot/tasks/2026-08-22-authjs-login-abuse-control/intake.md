# Intake — AuthJS Credentials Login Has No Dedicated Abuse Control (Case 3 of multi-case security audit)

## Source

User-supplied security audit finding, Case 3 of the ongoing multi-case
remediation series (Case 1: cross-tenant IDOR in `/api/admin/users`; Case 2:
`deactivatedAt` not enforced). Same message also requested CAPTCHA-vendor
research as part of the fix.

## Mode

`security-incident-workflow` (authorization/abuse-prevention gap).

## Severity

**P1** — confirmed missing dedicated throttling on a password-verification
endpoint (brute force / credential stuffing / password spraying), plus a
bcrypt CPU-amplification concern.

## Problem Statement

`/api/auth/callback/credentials` is exempted from the generic proxy-level
rate limiter (`AUTHJS_PROTOCOL_RATE_LIMIT_BYPASS_PATHS`), on the assumption
the route handler compensates. Investigation confirmed the route handler
_did_ have a dedicated IP+identifier check already — but it reused the
generic `API_RATE_LIMIT_*` config (tuned for general API tolerance, not a
login endpoint), via a single flat sliding window with no escalation, no
persistent failure-based lockout, and no CAPTCHA option. `Credentials.authorize()`
itself had zero throttling of its own.

## Decision Record (via `AskUserQuestion`, this session)

The user was asked and confirmed:

1. **CAPTCHA provider**: Cloudflare Turnstile, Managed mode. Researched
   alongside hCaptcha and Google reCAPTCHA v3 — Turnstile has no request cap
   on its free tier (reCAPTCHA's free tier is capped at 10k assessments/month
   and requires a Google Cloud billing instrument even to create a site key),
   and its Managed mode is Cloudflare's own adaptive/escalating challenge
   (invisible pass → checkbox → interactive puzzle, decided by their risk
   engine) — matching the "as low-friction as possible, harder challenge
   after repeated fails" behavior the user asked for, with zero custom
   escalation logic needed on our side for _how hard_ the challenge is (only
   _when_ to require one, which this fix's own progressive counter decides).
   Sources consulted: prosopo.io's 2026 Turnstile/reCAPTCHA/hCaptcha
   comparisons, oopspam.com's pricing comparisons, Cloudflare's own Turnstile
   docs.
2. **Scope**: implement everything in one fix now (dual-bucket rate limit +
   progressive lockout + audit logging + full Turnstile wiring), not split
   into a separate CAPTCHA follow-up.
3. **Thresholds**: OWASP-aligned defaults — 3 (CAPTCHA) / 8 (progressive
   delay) / 15 (temporary lock) failed attempts, 30-minute rolling window.

## Scope

- `src/app/api/auth/[...nextauth]/route.ts` — IP bucket, dedicated config
- `src/modules/auth/infrastructure/authjs/auth.ts` — account bucket wired
  into `authorize()`
- `src/shared/lib/rate-limit/login-abuse-control.ts` — new: progressive
  failure counter (Redis-backed, local fallback)
- `src/shared/lib/captcha/turnstile.ts` — new: server-side Turnstile
  verification
- `src/shared/components/captcha/TurnstileWidget.tsx` — new: client widget
- `src/app/auth/signin/sign-in-client.tsx` — CAPTCHA UI wiring
- `src/core/env.ts` / `.env.example` — new env vars
- Regression tests at every layer above
- `docs/ai/general/SECURITY_CODING_PATTERNS.md` (SEC-34),
  `docs/features/32 - AuthJS Custom Auth Provider.md`

## Out Of Scope (explicitly deferred — see `docs/ai/general/POSSIBLE_ENHANCEMENTS.md`)

- Applying the same dual-bucket pattern to any other password-verification
  endpoint this repo might add in the future (none currently exist besides
  AuthJS Credentials).
- A dedicated `/security-showcase`-style demo page for the CAPTCHA flow.

## Acceptance Criteria

1. IP bucket and account bucket are independent — rotating either alone
   does not bypass the other.
2. Account bucket escalates progressively (CAPTCHA → delay → lock) rather
   than a single flat cutoff, and a locked/captcha-blocked attempt never
   reaches the DB/bcrypt comparison.
3. CAPTCHA gate is skippable (not hard-fail) when Turnstile keys are unset.
4. `E2E_ENABLED` bypasses both buckets entirely.
5. A successful login resets the account's failure counter.
6. All quality gates green.
