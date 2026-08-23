# Task Plan — Strict Rate-Limit Mode (SEC-42)

## Status

**✅ IMPLEMENTED.** Twelfth case in the multi-case security-audit remediation
series; commits land on the same branch as Cases 1–11,
`claude/security-audit-multi-tenant-idor-e1y3yr`.

Intake, verified current state, hard constraints and the full Decision Record
are in `intake.md` and are not repeated here.

## Leantime (mandatory protocol)

**BLOCKED — same session/environment limitation as Cases 1–11** (no
`.env.leantime`/`LEANTIME_URL` in this sandbox; see Case 1's `plan.md` for the
diagnostic trail). Not re-diagnosed here.

## What Was Built

### 1. The chain: Upstash → Postgres → fail closed

`checkRateLimit(identifier, { mode: 'strict', ... })` in
`src/shared/lib/rate-limit/rate-limit-helper.ts`. On a primary failure it
reaches for a durable secondary, and refuses when neither store answers.
Standard mode is untouched — ordinary API throttling keeps the availability
trade it was designed for.

`strict` also applies when Upstash is **not configured at all**, not only when
it errors. A production deployment without Upstash must not silently downgrade
a security-critical limit to a per-instance `Map`; that is a deployment
decision, not an outage.

### 2. The durable secondary

New `rate-limit` module, because `shared/` may not reach the database:

- `domain/DurableRateLimitStore.ts` — the port. "Durable" is defined as
  _shared across serverless instances_, which is the property the process-local
  `Map` lacks and the whole reason this case exists.
- `infrastructure/drizzle/DrizzleRateLimitStore.ts` — one
  `INSERT … ON CONFLICT DO UPDATE … RETURNING`. A `SELECT`-then-`UPDATE` pair
  loses increments under concurrency, and on an abuse-control path a lost
  increment is a free attempt for the attacker.
- Migration `0018_busy_mad_thinker.sql`, fixed-window rows keyed
  `(identifier, window_start)`. **Registered in `readMigrationSql()` in the
  same commit** — the omission that broke five deploys in Case 6 (see that
  case's note); the guard test added there caught this one immediately.

The table is written _only_ while the primary is down, so it is normally
empty and the write cost does not land on the auth hot path.

### 3. Runtime placement

`src/security/api/strict-rate-limit.ts` is the only file that knows both that
the secondary is Postgres and that the switch comes from the container. The
`shared/lib` helper takes its strict dependencies as a structurally-typed
parameter and imports nothing from the module — otherwise Node-only database
code would be dragged toward the Edge bundle, and persistence knowledge into
`shared/`.

**The Edge middleware (`withRateLimit` in `src/proxy.ts`) is deliberately
unchanged**, per the owner's decision to defer it. The repo's `postgres`
(postgres.js) driver is TCP-based and there is no `@neondatabase/serverless`,
so Edge cannot reach the secondary without a new dependency. Tracked as
`PE-16`.

### 4. The operational switch

`core/contracts/operational-switch.ts` — a narrow, **subject-less and
tenant-less** port, with `EnvOperationalSwitch` (base),
`FeatureFlagOperationalSwitch` (override) and `LayeredOperationalSwitch`
(composer) under `src/security/core/operational-switch/`.

Not `FeatureFlagService` directly: that contract requires an
`AuthorizationContext`, and every control these switches guard runs _before_
authentication. Fabricating a context at each call site is the ad-hoc
feature-flag coupling the architecture rules forbid; doing it once inside an
adapter is what adapters are for.

**The override is loosen-only** — `result = (override === true) ? true : base`.
`FeatureFlagService.isEnabled()` returns a plain boolean and
`ResilientFeatureFlagService` answers `false` when its delegate throws, so
"the operator set this to false" and "the flag store is unreachable" arrive as
the same value. A symmetric override would let any flag outage silently
rewrite the deployment's security posture. Loosen-only makes the failure
direction safe by construction.

The override is wired **only** for `FEATURE_FLAG_PROVIDER` in
`{db, growthbook}`. Under `static` the flags themselves come from
`FEATURE_FLAGS_STATIC` — an env var — so layering it over the env base would
add a moving part and no capability.

## Correction Recorded During This Case

An earlier statement in this session implied the repo's feature flags are not
runtime-togglable, and the owner pushed back. **They were right.**
`DrizzleFeatureFlagService.isEnabled()` issues a fresh `SELECT` per call with
no cache, and the admin GUI writes the same table — so with
`FEATURE_FLAG_PROVIDER=db` a toggle takes effect on the next request, exactly
like GrowthBook. Redeploy is required only under `static`, which happens to be
the current default.

This also narrowed the circularity objection to its true size: a DB-backed
switch is unreachable only when Postgres is down, and that is precisely the
scenario where these endpoints are dead anyway (every one of them resolves
`DrizzleDb`). For the risk that actually motivates a fast lever — _the new
Postgres counter itself misbehaving while Postgres is healthy_ — the DB-backed
flag works. The design is better for the correction.

## Endpoints Now In Strict Mode

| Endpoint                              | Before                | After                                              |
| ------------------------------------- | --------------------- | -------------------------------------------------- |
| `/api/auth/[...nextauth]` credentials | Upstash → local `Map` | strict, `LOGIN_RATE_LIMIT_IP_*`                    |
| `/api/auth/forgot-password`           | Upstash → local `Map` | strict                                             |
| `/api/auth/resend-verification`       | Upstash → local `Map` | strict                                             |
| `/api/auth/waitlist`                  | Upstash → local `Map` | strict                                             |
| `/api/auth/reset-password`            | **no limit at all**   | strict (token-redemption + bcrypt oracle)          |
| `/api/auth/signup`                    | **no limit at all**   | strict (row/mail/bcrypt + invitation-token oracle) |
| `/api/auth/invite`                    | **no limit at all**   | strict, keyed on the **inviting user**, 20/h       |

The invite key is the user, not the IP: the attacker there is a legitimate
member spending the organization's sending reputation, and an IP key would
both miss a rotating-IP account and punish everyone behind a shared NAT.

## Validation

Falsification runs, not just green runs:

- The real-DB concurrency test (`25` overlapping increments must yield
  `1..25`) was **verified to fail** when the store is rewritten as
  `SELECT`-then-write.
- `does NOT fall back to the process-local counter on a double outage` exists
  because every other strict assertion still passes if that regression
  returns.
- `LayeredOperationalSwitch` has explicit tests for the loosen-only rule in
  both directions and for a throwing override.

One design defect was caught by its own test: `LayeredOperationalSwitch`
propagated an override's exception while its docstring claimed it fell through
to the base. The code was fixed to match the documented intent rather than the
test renamed to match the code.

## Enforcement

`src/security/api/strict-rate-limit.guard.test.ts` names the seven endpoints
that must go through `checkStrictRateLimit` and fails if one drops back to the
plain helper, or calls both. Same reasoning as SEC-23/SEC-38/SEC-41: swapping
one call back leaves every other test green while the control quietly becomes
per-instance again.

A deliberate list rather than a walk of `src/app/api/auth/**` — not every
route there is a pre-auth entry point (`active-org` switches an already
authenticated session's organization), and a walk would need an exclusion list
that is just this list inverted. A third assertion catches the reverse drift:
an endpoint that adopts strict mode but is never added to the list, so nothing
would notice if it later regressed.

**Verified to fail** when `reset-password` is reverted to `checkRateLimit`.

## Quality Gates

| Gate                      | Command                 | Result                                          |
| ------------------------- | ----------------------- | ----------------------------------------------- |
| Typecheck                 | `pnpm typecheck`        | ✅                                              |
| Lint (with fix)           | `pnpm lint --fix`       | ✅ 0 errors, 12 pre-existing unrelated warnings |
| Unit tests                | `pnpm test`             | ✅ 234 files / 1807 tests                       |
| DB integration tests      | `pnpm test:db`          | ✅ 22 files / 179 tests                         |
| Circular dependency check | `pnpm skott:check:only` | ✅                                              |
| Unused dependency check   | `pnpm depcheck`         | ✅                                              |
| Env consistency           | `pnpm env:check`        | ✅                                              |

**Not run in this session**: Playwright E2E.

## Behaviour Note — E2E And Local Development

Without Upstash configured, these endpoints previously used `localRateLimit`,
whose `Map` is shared across a single dev server, so they were already
rate-limited at `API_RATE_LIMIT_REQUESTS`/`API_RATE_LIMIT_WINDOW` during an
E2E run. Strict mode keeps the same limit and window; it changes only where
the counter lives.

One real difference: the process-local `Map` resets when the dev server
restarts, the table does not. Within a 60-second window a restart no longer
clears the count. That self-heals at the next window boundary, but a spec that
restarts the server and immediately repeats a sign-up may see a 429 it did not
see before. Not observed in this session — Playwright was not run — so it is
recorded as something to watch rather than as a known problem.

`[...nextauth]` keeps its `E2E_ENABLED` bypass, and its test now asserts the
bypass is a genuine skip (the limiter is never consulted) rather than a
generous limit -- so an E2E run cannot fail closed on sign-in either.

## Residual Risk / Follow-Ups

- `PE-16` — raise the Edge middleware's generic per-IP window to strict mode.
  Needs an Edge-compatible database driver; explicitly deferred by the owner.
- `PE-17` — a global purge for `rate_limit_counters`. Cleanup today is
  identifier-scoped and opportunistic, which bounds growth for repeat callers
  but leaves rows for identifiers never seen again after an outage.
- The login **account** bucket (`login-abuse-control.ts`, SEC-34) still
  degrades to a process-local `Map`. It is a progressive counter rather than a
  window and needs its own durable shape; the IP bucket in front of it is now
  strict. Tracked as `PE-18`.

## Test-Infrastructure Changes

`src/shared/lib/rate-limit/rate-limit-helper.mock.ts` now also stubs
`@/security/api/strict-rate-limit` and exports `mockCheckStrictRateLimit`
(re-exported through `@/testing`). Route tests that only care about the
handler should use it: `checkStrictRateLimit` resolves the DI container and
the Drizzle store, which no route-level assertion is about.

Three route test files were updated rather than left passing by accident:

- `[...nextauth]/route.test.ts` drove the _real_ limiter through its
  process-local fallback to prove the 429. That fallback is exactly what
  strict mode removes, so the tests were rewritten against a counting stub of
  the strict entry point, plus two new assertions the old shape could not
  make: that the route asks with the endpoint's own window rather than the
  generic one, and that a fail-closed answer becomes a 429 without reaching
  NextAuth.
- `reset-password/route.test.ts` and `signup/route.test.ts` mocked
  `@/core/contracts` with only `INFRASTRUCTURE`; the new import chain reaches
  more of it. Stubbing the strict entry point keeps those files about the
  handler.
