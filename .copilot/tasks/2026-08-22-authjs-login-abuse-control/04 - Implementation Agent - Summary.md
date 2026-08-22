# 04 - Implementation Agent - Summary

## Task Context

- Task ID: `2026-08-22-authjs-login-abuse-control`
- Task Objective: Implement the dual-bucket login abuse control per the consolidated Security/Auth, Runtime, and Architecture constraints.
- Current Run Scope: as listed in Files Changed below.
- Status: COMPLETED
- Last Updated: 2026-08-22
- Related Control Artifacts: `02 - Security & Auth - Summary.md`, `03 - Next.js Runtime - Summary.md`, `01 - Architecture Guard - Summary.md`, `05 - Validation Strategy - Summary.md`

## Scope Handled

- modules / files changed: see Files Changed.
- implementation goals in scope: dedicated IP-bucket rate limit; progressive account-bucket failure counter (CAPTCHA/delay/lock); Cloudflare Turnstile server verification + client widget; wiring into `authorize()` and the sign-in form.
- constraints applied: all constraints from `02 - Security & Auth - Summary.md` (two independent buckets, failure-based not request-based account counting, pre-DB lock/captcha short-circuit, self-disabling CAPTCHA gate, `E2E_ENABLED` bypass) and `01 - Architecture Guard - Summary.md` (new primitives in `shared/lib`/`shared/components`, generic non-AuthJS-specific parameters).

## Inputs Reviewed

- code paths reviewed: `src/security/middleware/with-rate-limit.ts`, `src/shared/lib/rate-limit/{rate-limit,rate-limit-helper,rate-limit-local}.ts`, `src/app/api/auth/[...nextauth]/route.ts` (pre-fix), `src/modules/auth/infrastructure/authjs/auth.ts` (pre-fix), `src/app/auth/signin/sign-in-client.tsx` (pre-fix), `src/security/middleware/with-headers.ts` (CSP, confirmed no change needed), `src/core/env.ts`, `src/testing/infrastructure/env.ts`
- upstream specialist artifacts reviewed: `02`, `03`, `01`, `05` (this task's own)
- earlier implementation notes reviewed: Cases 1–2's Implementation Agent summaries for this series' conventions

## Actions Performed

- code changes made: see Files Changed.
- tests or supporting files updated: see Files Changed.
- focused validation executed: `pnpm typecheck`, `pnpm lint --fix`, targeted `vitest run` per new/changed test file, `pnpm test` (full unit suite), `pnpm test:db` (full DB suite, unaffected), `pnpm skott:check:only`, `pnpm depcheck`, `pnpm env:check` — all green (see `plan.md`).

## Files Changed

- production files:
  - `src/core/env.ts` — new server vars (`LOGIN_RATE_LIMIT_IP_REQUESTS`, `LOGIN_RATE_LIMIT_IP_WINDOW`, `LOGIN_ABUSE_WINDOW`, `LOGIN_ABUSE_CAPTCHA_THRESHOLD`, `LOGIN_ABUSE_DELAY_THRESHOLD`, `LOGIN_ABUSE_LOCK_THRESHOLD`, `TURNSTILE_SECRET_KEY`) and client var (`NEXT_PUBLIC_TURNSTILE_SITE_KEY`)
  - `.env.example` — corresponding entries with comments
  - `src/testing/infrastructure/env.ts` — matching defaults for the new keys (required by `MutableEnv`'s type)
  - `src/shared/lib/rate-limit/rate-limit.ts` — exports the previously-private `redis` client for reuse
  - `src/shared/lib/rate-limit/login-abuse-control.ts` — **new**: `normalizeLoginAccountKey`, `getLoginAbuseState`, `recordFailedLoginAttempt`, `recordSuccessfulLogin`; Redis-backed with in-memory fallback and Redis-error-falls-back-to-local resilience
  - `src/shared/lib/captcha/turnstile.ts` — **new**: `isTurnstileConfigured`, `verifyTurnstileToken` (fails closed, 5s timeout)
  - `src/shared/components/captcha/TurnstileWidget.tsx` — **new**: client widget, Managed mode, single shared script load per page
  - `src/app/api/auth/[...nextauth]/route.ts` — rewritten: IP-only dedicated rate limit (was IP+identifier reusing generic `API_RATE_LIMIT_*`); `E2E_ENABLED` bypass
  - `src/modules/auth/infrastructure/authjs/auth.ts` — `authorize()` now checks the account bucket (lock → captcha → delay, in that order) before any DB query; records failures/successes; `credentialsSchema` gained optional `cfTurnstileToken`
  - `src/app/auth/signin/sign-in-client.tsx` — new error messages for `CaptchaRequired`/`AccountTemporarilyLocked`; conditionally renders `TurnstileWidget` only after the server actually returns `CaptchaRequired`; includes `cfTurnstileToken` in the next `signIn()` call once verified
- test files:
  - `src/shared/lib/rate-limit/login-abuse-control.test.ts` — **new**: 18 cases (normalization, all three thresholds, ordering, independence, Redis-backed + local fallback, Redis-error resilience)
  - `src/shared/lib/captcha/turnstile.test.ts` — **new**: 9 cases (configured/unconfigured, success/failure/timeout/network-error, remoteip forwarding)
  - `src/shared/components/captcha/TurnstileWidget.test.tsx` — **new**: 5 cases (script load-once, render + token callback, expire callback, load-error message, unmount cleanup)
  - `src/app/api/auth/[...nextauth]/route.test.ts` — **new**: 5 cases (non-credentials passthrough, under/over limit, `E2E_ENABLED` bypass, per-IP independence)
  - `src/modules/auth/infrastructure/authjs/auth.test.ts` — 9 new cases under a `login abuse control (SEC-34)` describe block (below-threshold no-op, captcha required/satisfied/skipped-when-unconfigured, lock before DB, `E2E_ENABLED` bypass, counter reset on success, progressive delay)
  - `src/app/auth/signin/sign-in-client.test.tsx` — 5 new cases (locked-account message, widget hidden until required, widget shown + submit disabled, resubmission with token, widget hidden when no site key configured)
- docs / artifact files:
  - `docs/ai/general/SECURITY_CODING_PATTERNS.md` — new SEC-34 entry + Pattern Index row
  - `docs/features/32 - AuthJS Custom Auth Provider.md` — new "Login Abuse Control (SEC-34)" section + Module Structure update
  - `.copilot/tasks/2026-08-22-authjs-login-abuse-control/*` — this artifact set

## Behavior Change Summary

- previous behavior: `/api/auth/callback/credentials` was throttled only by a generic per-IP+identifier reuse of `API_RATE_LIMIT_*` (a flat sliding window with no relationship to failure count, no escalation, no CAPTCHA option); `Credentials.authorize()` had no throttling of its own and ran a bcrypt comparison on every request with a matching credential row regardless of recent failure history.
- new behavior: the IP bucket uses a dedicated, tighter config (`LOGIN_RATE_LIMIT_IP_*`); the account bucket tracks consecutive failures (not raw requests) and escalates progressively — CAPTCHA required (3), increasing artificial delay (8), temporary lock (15) — with the lock and CAPTCHA checks running before any DB query, so a clearly-abusive request never reaches bcrypt. A successful login resets the account's counter. The CAPTCHA gate is a no-op when Turnstile isn't configured. Both buckets are bypassed entirely under `E2E_ENABLED`.
- intentional non-changes: `AUTHJS_PROTOCOL_RATE_LIMIT_BYPASS_PATHS` in `with-rate-limit.ts` is unchanged (still correct, since the route handler's own dedicated check compensates); no CSP changes (the required `challenges.cloudflare.com` allowlist entries already existed); no real Cloudflare Turnstile account/keys were provisioned or exercised end-to-end in this session.

## Implementation Decisions / Constraints

- implementation choices made: `login-abuse-control.ts` and `turnstile.ts` placed in `shared/lib` (not `modules/auth`) with generic, non-AuthJS-specific parameters, so any future password-verification endpoint can reuse them; the account-bucket check order is lock → captcha → delay (strongest signal first, matching SEC-33's "check the strongest signal first" precedent from Case 2); `TurnstileWidget` hand-rolled (no new npm dependency) rather than pulling in a third-party React wrapper package, given the vanilla integration is small and this keeps the dependency surface unchanged.
- constraints preserved: two independent buckets; failure-based (not request-based) account counting; pre-DB-work short-circuit for lock/captcha; self-disabling CAPTCHA gate; `E2E_ENABLED` bypass for both buckets; no changes to `AUTHJS_PROTOCOL_RATE_LIMIT_BYPASS_PATHS` or CSP.
- tradeoffs accepted: `login-abuse-control.ts`'s Redis-error-falls-back-to-local behavior means a transient Redis outage silently resets to a less-informed (likely zero) failure count rather than failing the login request outright — a deliberate availability-over-strictness tradeoff, consistent with this repo's existing `checkRateLimit()` degrade-to-local pattern for the exact same class of infra hiccup.

## Validation Performed

- commands run: `pnpm typecheck`; `pnpm lint --fix`; targeted `vitest run` per new/changed test file; `pnpm test` (full unit suite, 222 files / 1628 tests, +4 files/+50 tests); `pnpm test:db` (full DB suite, 19 files / 160 tests, unchanged); `pnpm skott:check:only`; `pnpm depcheck`; `pnpm env:check`.
- results: all green — see `plan.md`'s gate table.
- validation not run: Playwright E2E; real Cloudflare Turnstile round trip (no credentials available in this session).
- residual risk from validation gaps: the CAPTCHA layer's real-provider behavior is unverified end-to-end; the abuse-control logic itself (rate limiting, escalation, lock) is fully verified independent of that provider.

## Artifact Synchronization

- `plan.md` updates: implementation + gate results recorded.
- `intake.md` updates: none required beyond initial scope and the `AskUserQuestion` decision record.
- `implementation-plan.md` updates: not used for this workflow.
- specialist artifact updates: none beyond this file.

## Open Questions / Blockers

- unresolved questions: none.
- blockers: none.
- follow-up needed: real Turnstile key provisioning + end-to-end browser smoke check (see `plan.md`).

## Handoff Notes

- what the next agent should rely on: this fix is complete and gate-verified; ready to push for the user's PR/CI step, with the real-Turnstile-verification caveat called out explicitly.
- residual risks for review: see `plan.md` residual risks section.
- recommended next specialist or step: none for this case — awaiting the user's next case in the audit series, and/or real Turnstile key provisioning.

## Update Log

### Update Entry

- Date: 2026-08-22
- Trigger: Implementation of the consolidated remediation constraints.
- Summary of change: Implemented the dedicated IP-bucket rate limit, the progressive account-bucket failure counter, Cloudflare Turnstile server verification and client widget, wired both into `authorize()` and the sign-in form, added regression tests at every layer, updated docs.
- Sections refreshed: all.
