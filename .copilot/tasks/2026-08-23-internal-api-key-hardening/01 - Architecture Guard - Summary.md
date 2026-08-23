# 01 — Architecture Guard — Summary (SEC-44)

## Objective

Validate the proposed hardening of the internal-API key guard before any code
changes: failed-attempt rate limiting, constant-time comparison, key rotation,
and whether the HMAC or mTLS tiers belong in this case.

## Current-State Findings

**F1 — Failed internal-key attempts are not rate limited at all.**
`createSecurityPipeline` (`src/proxy.ts:151-158`) composes
`withInternalApiGuard` **before** `withRateLimit`. A rejected key returns 403
from the guard and never reaches the limiter, so key guessing is unmetered.
This is the reported issue and it is real.

**F2 — Comparison is `!==` on a `string`** (`with-internal-api-guard.ts:39`).
Not constant-time.

**F3 — `INTERNAL_API_KEY: z.string().min(1).optional()`** (`env.ts:94`). A
one-character key is a valid configuration. No entropy floor, and no rotation
path — a single value that must be changed everywhere at once.

**F4 — A chained leak that makes F1 worth more to an attacker.**
`/api/internal/env-check` returns `getEnvDiagnostics()`, whose entries carry
`maskedValue` = `value.slice(0,2) + '***' + value.slice(-4)`
(`env-diagnostics.ts:46-56`) for `CLERK_SECRET_KEY`,
`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `INTERNAL_API_KEY`. So a guessed
internal key yields partial `CLERK_SECRET_KEY` material, and the response also
discloses the last four characters of the internal key itself.

**F5 — The same fragments leak without the internal key at all.**
`/env-summary` (`src/app/env-summary/page.tsx:31`) and
`EnvDiagnosticsExample.tsx:24` render the same `maskedValue`. `/env-summary`
is a `DEMO_ROUTE_PREFIXES` entry, so with the demo flag on it is reachable by
any signed-in user. The guard is not the only door to this data.

**F6 — There is no production service-to-service consumer.** The three
internal routes are `/api/internal/health`, `/api/internal/env-check` and
`/api/internal/e2e/authjs-user`. The only callers in the repository are the
Playwright suite (`e2e/authjs-auth.ts:42`, `e2e/security.spec.ts:67,82`), and
the E2E route already returns 404 unless `E2E_ENABLED && AUTH_PROVIDER=authjs`.

## Docs vs Code Drift

None found for this area.

## Architectural Assessment

**The minimum tier is sound and should be built.** Constant-time comparison,
a dedicated failed-attempt limiter and rotation are all small, local, and
correct independent of who calls these endpoints. F1 in particular is a
genuine hole, not a theoretical one.

**The HMAC tier should be blocked for now.** `HMAC(timestamp, method, path,
SHA256(body), nonce)` plus a replay window is a service-to-service
authentication protocol, and per F6 this repository has **zero** such
services. Building it now means a nonce store, clock-skew tolerance, a signing
client, and a second authentication path — all without a consumer to keep it
honest. That is the speculative generality this role exists to flag, and
unexercised security code decays into a liability rather than a defence.
Recorded as a follow-up with an explicit trigger instead.

**mTLS is not a code decision.** It is an infrastructure capability; on
Vercel's managed platform it is not available to the application layer at all.
Out of scope by construction.

**F4/F5 change the priority order.** Removing `maskedValue` is the cheapest
item on the whole list and it removes the reason a brute-force would pay off.
It must be fixed at the `EnvDiagnosticsEntry` / `getEnvDiagnostics()` source,
not in the route's JSON — otherwise `/env-summary` keeps serving the same
fragments to any signed-in user with demo mode on.

## Risks In The Approved Approach

**R1 — The guard runs in Edge; the SEC-42 strict limiter does not.**
`withInternalApiGuard` is composed into `src/proxy.ts`, and
`checkStrictRateLimit` resolves the DI container and a TCP Postgres driver.
The durable store available in Edge is Upstash (REST over `fetch`), already
exported as `redis` from `rate-limit.ts`. The failed-auth limiter must
therefore be built directly on that, not on `checkStrictRateLimit`.

**R2 — Failing closed here would break diagnostics exactly when needed.**
Unlike SEC-42's endpoints, `/api/internal/health` and `/env-check` exist to be
called _during_ an incident. If the counter store is unavailable, denying a
**correct** key would remove the operator's diagnostic during an outage. The
key check still runs either way, so degradation means "brute-force protection
is weaker", not "anyone gets in" — and with an entropy floor on the key
(below), the unmetered search space is infeasible regardless. The limiter is
defence in depth here, not the primary control. This asymmetry with SEC-42 is
deliberate and must be stated in the code.

**R3 — An entropy floor is a deploy-ordering hazard.** Requiring a minimum
key length in production will fail the build for any deployment whose current
`INTERNAL_API_KEY` is shorter. Same class as `DEPLOYMENT_PROXY` in SEC-43: the
owner must be told before the push.

**R4 — Removing `maskedValue` changes a response shape and two UIs.**
Low blast radius (`env-summary/page.tsx`, `EnvDiagnosticsExample.tsx`), but it
is a visible change, not purely internal.

## Recommended Next Action

**Safe to proceed** with the minimum tier as scoped by the owner:

1. Dedicated failed-auth limiter in the security layer, built on the Edge-safe
   Upstash client. Do **not** reorder the pipeline to reuse the generic API
   limiter — the guard rejecting before `withRateLimit` is correct layering,
   and a rejected internal request should not consume a client's ordinary API
   allowance.
2. Constant-time verification via `crypto.subtle` digest comparison
   (`timingSafeEqual` is Node-only and unavailable in Edge).
3. `current + previous` key rotation with an entropy floor in production.
4. `maskedValue` removed at the `getEnvDiagnostics()` source, both consumers
   updated.

**Blocked, with a trigger**: HMAC request signing and replay protection, and
service identity / mTLS. Revisit on the first real production
service-to-service consumer, or the first internal endpoint whose impact
warrants per-request authentication.
