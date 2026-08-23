# 02 - Security & Auth - Summary

## Task Context

- Task ID: `2026-08-22-authjs-login-abuse-control`
- Task Objective: Close the missing dedicated throttling/lockout gap on AuthJS Credentials login.
- Current Run Scope: route handler IP check, `authorize()` account-bucket wiring, CAPTCHA integration.
- Status: COMPLETED
- Last Updated: 2026-08-22
- Related Control Artifacts: `intake.md`, `plan.md`, `04 - Implementation Agent - Summary.md`, `docs/ai/general/SECURITY_CODING_PATTERNS.md` (SEC-34)

## Scope Handled

- auth surfaces reviewed: `AUTHJS_PROTOCOL_RATE_LIMIT_BYPASS_PATHS` (`with-rate-limit.ts`), the pre-existing IP+identifier check in `route.ts`, `Credentials.authorize()`
- authorization surfaces reviewed: N/A (this is an abuse-prevention/rate-limiting concern, not ABAC)
- trust-boundary questions in scope: is a generic per-API rate limit an adequate substitute for dedicated login throttling; does the account-side control need to be request-count-based or failure-count-based; where must a lockout check run relative to the expensive credential comparison

## Inputs Reviewed

- code paths reviewed: `src/security/middleware/with-rate-limit.ts`, `src/app/api/auth/[...nextauth]/route.ts` (pre-fix), `src/modules/auth/infrastructure/authjs/auth.ts` (pre-fix), `src/shared/lib/rate-limit/{rate-limit,rate-limit-helper,rate-limit-local}.ts`, `src/core/env.ts`, `src/security/middleware/with-headers.ts` (CSP)
- security/auth docs reviewed: OWASP Authentication/Credential-Stuffing Cheat Sheets (referenced directly in the user's report), `docs/ai/general/SECURITY_CODING_PATTERNS.md` (SEC-17, SEC-21)
- earlier task artifacts reviewed: Cases 1–2 of this series for conventions
- external research performed: `WebSearch` for current (2026) Cloudflare Turnstile / hCaptcha / Google reCAPTCHA v3 free-tier pricing and integration patterns — see `intake.md`'s Decision Record for sources and conclusion

## Actions Performed

- identity flow tracing performed: confirmed the pre-fix route handler already computed a normalized-email hash and an IP, and called `checkRateLimit()` (the generic helper bound to `API_RATE_LIMIT_REQUESTS`/`API_RATE_LIMIT_WINDOW`) against both — i.e. a rate limiter existed, but not a dedicated one, and with no escalation/lockout concept at all.
- authorization enforcement review performed: N/A for this case (no ABAC/tenant concern).
- abuse-model review performed: confirmed two independent risk dimensions (request volume from one IP; targeted attempts against one account) require two independent controls — a single combined key (e.g. `ip+email`) would be trivially bypassed by rotating either dimension, exactly as the user's report warned.
- CPU-amplification review performed: confirmed `bcrypt.compare()` runs unconditionally for any request that reaches a real credential row, before this fix. Required the lock/captcha checks to run **before** any DB query, not just before returning a result, so a request from a locked-out account never triggers the DB round trip or the bcrypt call at all.
- CAPTCHA vendor review performed: compared Cloudflare Turnstile, hCaptcha, Google reCAPTCHA v3 for cost, friction, and adaptive-difficulty behavior; recommended and (per user confirmation) implemented Turnstile in Managed mode. See `intake.md`'s Decision Record.

## Current-State Findings

- Confirmed: the gap was real — `API_RATE_LIMIT_REQUESTS=10` / `60 s` (the default) is a per-minute-scale allowance appropriate for general API traffic, not for a password-guessing endpoint; it also had zero relationship to actual failure count (a mix of successes and failures counted identically), and zero escalation.
- Confirmed: `Credentials.authorize()` itself had no throttling of its own prior to this fix — all abuse-prevention lived one layer up, in the route handler, which is bypassable by any consumer of `authOptions` that doesn't go through that specific route file (there is currently only one such consumer, but the layering was fragile).
- Risks: none remaining after the fix — direct unit tests prove both buckets, all three escalation tiers, the pre-DB-work short-circuit for locked accounts, and the `E2E_ENABLED` bypass.
- Drift: `CLOUDFLARE_DOMAINS = ['https://challenges.cloudflare.com']` was already present, unconditionally, in `with-headers.ts`'s CSP config (`script-src`/`connect-src`/`frame-src`) with no corresponding feature using it anywhere in the codebase before this fix — pre-provisioned but dormant. Confirmed via full-repo grep (no other Turnstile/Cloudflare reference existed). Not a defect; this fix is the first real consumer of that allowlist entry. Reported per "Source of Truth" discipline.

## Trust Boundary Assessment

- where identity is established: unchanged (identity resolution precedes both buckets).
- where authorization is enforced: N/A for this case.
- what claims or inputs are trusted: the client-supplied `cfTurnstileToken` is never trusted directly — always re-verified server-side against Cloudflare's `siteverify` API (`verifyTurnstileToken`), which fails closed (returns `false`) on any network/parse error rather than assuming success.
- the normalized-email hash (`normalizeLoginAccountKey`) is a one-way SHA-256 digest — raw emails never appear in Redis keys or log lines for this feature.

## Sensitive Data And Exposure Notes

- logging / telemetry review: new `getLogger().warn(...)` calls for `auth:login_account_locked` and `auth:login_captcha_required` log only the failure count and (for locks) the unlock timestamp — no raw email, no password, no Turnstile token.
- response exposure review: `AccountTemporarilyLocked` and `CaptchaRequired` are distinct, informative error codes surfaced to the client — this is intentional (the caller already knows which account they're trying to log into; there is no cross-party enumeration risk here, unlike Case 1's cross-tenant IDOR).
- client exposure review: `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is, by design, public (Turnstile site keys are not secrets); `TURNSTILE_SECRET_KEY` stays server-only.
- cache exposure review: not applicable.

## Security Decisions / Constraints

- approved controls or constraints:
  - Two independent buckets: IP (dedicated `LOGIN_RATE_LIMIT_IP_*` config, checked in the route handler) and account (progressive failure counter, checked inside `authorize()`).
  - The account bucket counts **failures**, not raw requests, and resets on success.
  - Escalation order and thresholds: CAPTCHA (3) → progressive delay (8) → temporary lock (15), all within one rolling `LOGIN_ABUSE_WINDOW` (30 min) — confirmed with the user, not chosen unilaterally.
  - A locked account must be rejected before any DB query/bcrypt call.
  - CAPTCHA gate must be self-disabling when Turnstile isn't configured — never a hard-fail-everyone default.
  - `E2E_ENABLED` bypasses both buckets entirely (mirrors the existing `E2E_RATE_LIMIT_BYPASS_API_PREFIXES` convention).
- rejected directions: none — the user's own report specified the required shape (two independent buckets, progressive response) and it was implemented as specified after confirming provider/scope/thresholds.
- required enforcement points: `src/app/api/auth/[...nextauth]/route.ts` (IP), `src/modules/auth/infrastructure/authjs/auth.ts` (account).

## Artifact Synchronization

- `plan.md` updates: workflow step sequence and gate results recorded.
- `intake.md` updates: scope, acceptance criteria, and the `AskUserQuestion` decision record.
- `implementation-plan.md` updates: not used for this workflow.
- specialist artifact updates: `docs/ai/general/SECURITY_CODING_PATTERNS.md` — new SEC-34 entry; `docs/features/32 - AuthJS Custom Auth Provider.md` updated.

## Open Questions / Blockers

- unresolved questions: whether the user wants real Turnstile keys provisioned and an end-to-end browser check performed before considering the CAPTCHA layer itself (not just the abuse-control logic) production-verified — flagged in `plan.md`.
- blockers: none.
- evidence still needed: real Cloudflare Turnstile credentials for an end-to-end smoke check (not available in this session).

## Handoff Notes

- what the next agent should rely on: the two-bucket, progressive-escalation pattern in `login-abuse-control.ts` is reusable for any future password-verification endpoint via `normalizeLoginAccountKey`/`getLoginAbuseState`/`recordFailedLoginAttempt`/`recordSuccessfulLogin` — it is not AuthJS-specific.
- what should not be re-decided without new evidence: the provider choice (Turnstile), the threshold values (3/8/15), and the decision to keep the CAPTCHA gate self-disabling when unconfigured.
- recommended next specialist or step: none for this case — awaiting the user's next case in the audit series, and/or real Turnstile key provisioning for end-to-end verification.

## Update Log

### Update Entry

- Date: 2026-08-22
- Trigger: Initial security review for this incident, including CAPTCHA vendor research requested by the user.
- Summary of change: Confirmed the reported gap, researched and (with user confirmation) selected Cloudflare Turnstile, defined the two-bucket progressive-escalation fix shape, added SEC-34.
- Sections refreshed: all.
