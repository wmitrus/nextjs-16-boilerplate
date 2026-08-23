# Task Plan — AuthJS Login Abuse Control (SEC-34)

## Status

**✅ REMEDIATION IMPLEMENTED.** All quality gates green. Third case in the
multi-case security-audit remediation series; commits land on the same
branch as Cases 1–2, `claude/security-audit-multi-tenant-idor-e1y3yr`.

**Follow-up (same day)**: user provisioned a real Cloudflare Turnstile
account and asked for E2E coverage of the CAPTCHA flow. See "Follow-Up:
E2E Spec" section below — the spec was written and wired but could not be
executed to completion in this session's sandbox; tracked as `PE-05` in
`docs/ai/general/POSSIBLE_ENHANCEMENTS.md`.

**Production verification (same day, commits `466aada` + `9e1c87b`)**: the
repo owner ran the flow manually in a real browser against a Vercel Preview
deployment. It found **four defects that every green unit test had passed** —
three in the Turnstile client integration, one in deployment configuration.
See "Production Verification Findings" below. This is the most important
outcome of the whole case and is why it was not closed on the strength of
the unit suite alone.

## Leantime (mandatory protocol)

**BLOCKED — same session/environment limitation as Cases 1–2** (no
`.env.leantime`/`LEANTIME_URL` available in this sandbox; see Case 1's
`plan.md` for the full diagnostic trail). Not re-diagnosed here per the
no-duplication convention in `docs/ai/general/POSSIBLE_ENHANCEMENTS.md`.

## Execution Mode

`straight-through`, single session. A genuine product/vendor decision (which
CAPTCHA provider, scope for this case, escalation thresholds) was surfaced to
the user via `AskUserQuestion` before implementation — see `intake.md`'s
Decision Record — rather than picked unilaterally, per the user's own
instruction to ask before any real decision point.

## Workflow Steps (Security Incident Workflow)

1. **Incident intake & classification** — see `intake.md`.
2. **Security/Auth review** — see `02 - Security & Auth - Summary.md`.
3. **Next.js Runtime review (conditional, ran)** — route handler + Server
   Component/client wiring touched; see `03 - Next.js Runtime - Summary.md`.
4. **Architecture Guard review (conditional, ran)** — new `shared/lib` and
   `shared/components` modules; see `01 - Architecture Guard - Summary.md`.
5. **Constraint summary** — consolidated in the Security & Auth summary.
6. **Validation Strategy** — see `05 - Validation Strategy - Summary.md`.
7. **Implementation** — see `04 - Implementation Agent - Summary.md`.
8. **Validation & close-out** — all gates green (below).

## Quality Gates (this session)

| Gate                      | Command                 | Result                                                                                      |
| ------------------------- | ----------------------- | ------------------------------------------------------------------------------------------- |
| Typecheck                 | `pnpm typecheck`        | ✅ pass                                                                                     |
| Lint (with fix)           | `pnpm lint --fix`       | ✅ 0 errors, 12 pre-existing unrelated warnings                                             |
| Unit tests                | `pnpm test`             | ✅ 222 files / 1629 tests pass (+4 files, +51 tests; +1 test in the E2E-override follow-up) |
| DB integration tests      | `pnpm test:db`          | ✅ 19 files / 160 tests pass (unchanged)                                                    |
| Circular dependency check | `pnpm skott:check:only` | ✅ no circular dependencies                                                                 |
| Unused dependency check   | `pnpm depcheck`         | ✅ no issues                                                                                |
| Env consistency           | `pnpm env:check`        | ✅ in sync                                                                                  |

**Not run in this session**: Playwright E2E, and no real Cloudflare
Turnstile account/keys were used (no such credentials available in this
session) — the implementation was validated against unit-level mocks of
the `siteverify` HTTP call, not a real Cloudflare round trip. The user must
provision real `TURNSTILE_SECRET_KEY` / `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
(Turnstile's official always-pass test keys work for local/CI smoke
verification) and confirm the widget renders/verifies end-to-end in a real
browser before treating the CAPTCHA layer itself as production-verified —
the abuse-control logic (buckets, thresholds, lock/delay) is fully
verified independent of that.

## Residual Risk / Follow-Ups

- No dedicated demo/showcase page was added for the CAPTCHA flow.
- The dual-bucket pattern is specific to this one login endpoint; if a
  future feature adds another password-verification endpoint, it needs its
  own instance of the same pattern (the module is reusable — `normalizeLoginAccountKey`,
  `getLoginAbuseState`, `recordFailedLoginAttempt`, `recordSuccessfulLogin`
  all take an arbitrary account key, not something AuthJS-Credentials-specific).
- Real end-to-end Turnstile verification (real keys, real browser) has not
  been performed in this session — see Quality Gates note above. A spec now
  exists (see below); running it is what's left.

## Follow-Up: E2E Spec (same day, after user provisioned real Turnstile keys)

Added `e2e/authjs-login-abuse-control.spec.ts` and
`pnpm e2e:authjs:login-abuse` (uses Cloudflare's official "always passes"
test keypair — `1x00000000000000000000AA` /
`1x0000000000000000000000000000000AA` — never real production credentials).
It drives two wrong-password attempts against a freshly provisioned AuthJS
user, asserts the Turnstile widget appears once
`LOGIN_ABUSE_CAPTCHA_THRESHOLD` is hit, waits for the test key to
auto-solve, then completes sign-in with the resulting token.

Supporting change: added `E2E_LOGIN_ABUSE_CONTROL_ENABLED` (env var, default
`false`) so this one spec can force the account-bucket abuse control back on
for its own run, overriding the blanket `E2E_ENABLED` bypass every other
authjs E2E spec relies on. Covered by a new unit test in `auth.test.ts`
("E2E_LOGIN_ABUSE_CONTROL_ENABLED forces abuse control back on despite
E2E_ENABLED") — 21/21 tests pass in that file, full suite unaffected (222
files / 1629 tests pass).

**Could not run to completion in this session.** Two independent blockers,
both environment-specific to this sandbox, not the fix:

1. `scripts/check-e2e-auth-env.mjs` unconditionally requires real Clerk
   fixture credentials for every scenario regardless of `AUTH_PROVIDER` —
   this sandbox has none configured, so it refused to run _any_ E2E
   scenario (`❌ Missing or invalid E2E Clerk fixture vars`), not just this
   new one.
2. Independent of (1): `challenges.cloudflare.com` (both the Turnstile
   script and `siteverify`) is blocked by this sandbox's outbound egress
   policy — confirmed via the proxy's own status endpoint, a 403 policy
   denial on CONNECT to that host. Even with (1) resolved, the real
   script-load/verify round trip cannot be observed from inside this
   session.

Full detail and the recommended next action are tracked as `PE-05` in
`docs/ai/general/POSSIBLE_ENHANCEMENTS.md` rather than duplicated here.

## Production Verification Findings (real browser, Vercel Preview)

All four were invisible to a fully green 1629-test suite. Each is now fixed
with a regression test that fails against the old code.

### 1. Widget remount loop — the user-visible bug (commit `466aada`)

**Symptom**: the Turnstile widget verified endlessly in circles, finishing
and restarting, never settling; then showed "Security check failed to load"
even though the widget had visibly loaded.

**Root cause**: `TurnstileWidget`'s render effect depended on
`[siteKey, onVerify, onExpire]`, while `sign-in-client.tsx` passed an inline
`onExpire={() => setCaptchaToken(null)}` — a new function identity on every
render. Solving the challenge called `onVerify` → `setCaptchaToken` → parent
re-render → new closure identity → effect cleanup ran `turnstile.remove()` →
effect re-ran `turnstile.render()` → fresh challenge → solved → repeat,
indefinitely. `onVerify` (a `useState` setter) was stable; `onExpire` alone
was enough to drive the loop.

**Fix**: the effect now depends on `siteKey` alone; both callbacks are read
through refs kept current by their own effects, so no parent re-render can
tear the widget down.

**Why the tests missed it**: every existing test rendered the widget once and
never re-rendered it with fresh callback identities — the exact condition
that triggers the bug. The new
`does not remount the widget when the parent passes new callback identities`
test closes that gap.

### 2. Single-use token replayed (commit `466aada`)

A Turnstile token is spent the moment the server redeems it via
`siteverify` — including when the login then fails for an unrelated reason
(wrong password). The form kept the spent token in state and resent it on
the next attempt, where it could only ever fail with `timeout-or-duplicate`.
Any submit that carried a token now discards it and bumps a `resetSignal`
prop driving `turnstile.reset()`, so the visitor gets a fresh challenge.

### 3. Provider error codes discarded (commit `466aada`)

`error-callback`'s code was collapsed into a boolean `loadError`, so a
genuine challenge failure was reported as "failed to load" — actively
misleading, and worse because Cloudflare's default `retry: 'auto'` then
restarted the challenge behind that message. The code is now captured,
logged, and rendered in the UI (`Security check failed (code 110200)`),
which also gave the owner a phone-only way to read diagnostics without
DevTools. Server-side, `siteverify`'s `error-codes`/`hostname`/`action` are
logged too — never the token or secret (asserted by a test).

### 4. Redis silently unavailable, control degraded (commit `9e1c87b`)

Preview logs showed `login_abuse:redis_read_failed` with
`TypeError: fetch failed`. Root cause: **the free-tier Upstash databases had
been auto-deleted after 14 days of inactivity**, so the REST endpoint no
longer existed. (An earlier hypothesis in-session — a `rediss://` connection
string pasted in place of the REST URL — was wrong; recorded here because
the hardening it prompted was kept on its own merits.)

The failure was swallowed by design: the module falls back to a
process-local `Map` so a Redis outage cannot lock every user out. On Vercel
that is **not an equivalent fallback** — lambda instances are ephemeral and
unshared, so the failure counter effectively resets per instance and the
captcha/delay/lock thresholds stop being reliably reachable. The control
reported healthy while its durable half was off. It appeared to work in
manual testing only because low traffic kept hitting one warm instance.

**Fixes**: the env schema now rejects any non-http(s) scheme for
`UPSTASH_REDIS_REST_URL` (a bare `z.url()` accepted the `rediss://` string
the Upstash dashboard offers beside the REST URL); all three Redis failure
paths now log the REST host and `degraded: true` and state in the message
that the counter is no longer durable across instances. Owner recreated the
database and updated the Vercel credentials.

## Lessons Recorded In SEC-34

Two new sections were added to SEC-34 in
`docs/ai/general/SECURITY_CODING_PATTERNS.md` so the next agent does not
repeat these: **"CAPTCHA Widget Integration Pitfalls"** (findings 1–3) and
**"Fail-Open Fallbacks Are Not Free On Serverless"** (finding 4).

The meta-lesson, worth stating plainly: **a green unit suite was not
evidence that a third-party integration worked.** Every one of these four
defects lived precisely in the seams the unit tests mocked away — the
React lifecycle around a foreign script, the provider's token semantics,
the provider's error channel, and the deployment's connectivity. For any
future third-party integration in this repo, real-environment verification
is part of the definition of done, not an optional follow-up.
