# Task Plan — Internal API Key Hardening (SEC-44)

## Status

**✅ IMPLEMENTED.** Fourteenth case in the multi-case security-audit
remediation series; commits land on the same branch as Cases 1–13,
`claude/security-audit-multi-tenant-idor-e1y3yr`.

The read-only validation that preceded implementation is in
`01 - Architecture Guard - Summary.md` and is not repeated here.

## Leantime (mandatory protocol)

**BLOCKED — same session/environment limitation as Cases 1–13.**

## Scope As Constrained By The Owner

> Implement minimum safe hardening only. Keep the existing shared-key
> authentication model for now. Add a dedicated strict/durable failed-auth
> limiter owned by the security layer; do not solve this by moving the generic
> API limiter before `withInternalApiGuard`. Use constant-time verification
> and support zero-downtime current+previous key rotation with
> cryptographically strong keys. Remove `maskedValue` at the
> `EnvDiagnosticsEntry`/`getEnvDiagnostics()` source so neither
> `/api/internal/env-check` nor `/env-summary` receives secret fragments. Do
> not implement HMAC or mTLS now. Record them as PE with the trigger: first
> real production service-to-service consumer or an internal endpoint whose
> impact warrants request authentication/replay protection. Add the
> corresponding Security Coding Pattern and regression coverage.

Every clause honoured. HMAC/mTLS recorded as `PE-21` with that exact trigger.

## What Was Built

- `src/security/internal-api/constant-time.ts` — digest-based comparison
  (`crypto.timingSafeEqual` is Node-only; this guard is Edge), and
  `verifyAgainstKeys`, which compares **every** candidate even after a match.
- `src/security/internal-api/failed-auth-limit.ts` — a counter for rejections
  only, on Upstash (the one durable store reachable from Edge).
- `with-internal-api-guard.ts` — lockout checked _before_ any comparison, so
  an exhausted caller gets no further oracle; rotation via
  `INTERNAL_API_KEY` + `INTERNAL_API_KEY_PREVIOUS`; a warning whenever the
  previous key is the one that matched.
- `INTERNAL_API_KEY_PREVIOUS` plus `validateInternalApiKeyConfigValues` —
  32-character floor in production, both slots must differ, wired into the
  composition root.
- `EnvDiagnosticsEntry` reduced to `{ name, present }`; `maskValue` deleted;
  `/env-summary` and `EnvDiagnosticsExample` updated.

## Why The Pipeline Was Not Reordered

`withInternalApiGuard` running before `withRateLimit` is correct layering, and
the owner ruled out changing it. An unauthenticated caller should be turned
away by the guard, not by a limiter that would then have charged a legitimate
client's ordinary API allowance for someone else's guessing. The unmetered
brute force is fixed by giving rejections their own counter.

## The Asymmetry With SEC-42, Stated On Purpose

SEC-42 fails **closed** when its durable store is unavailable. This limiter
does **not**, and that is deliberate rather than an oversight:

- SEC-42's endpoints already needed the database they could not reach, so
  failing closed cost no availability that was not already lost.
- `/api/internal/health` and `/env-check` exist to be called **during** an
  incident. Denying a _correct_ key because Redis is down would remove the
  operator's diagnostic exactly when they need it.
- The key check is unaffected either way, so a counter outage weakens
  brute-force protection rather than admitting anyone — and against a key with
  the new entropy floor, an unmetered search is infeasible.

Written into both modules and asserted by a test, so neither gets "tidied" to
match the other without someone reading why.

## Validation — Falsified, Not Merely Green

- The rotation-timing test (`compares every candidate even after the first one
matches`) counts element reads through a `Proxy`; **verified to fail** when
  the loop is given an early `return`. A clock-based assertion on two SHA-256
  digests would have been pure flake.
- `env-diagnostics.secrets.test.ts` asserts at the source and **verified to
  fail** when `maskedValue` is reintroduced.
- Limiter tests cover the degraded paths explicitly, including that an
  unreachable counter does **not** lock out a correct key.

One test of mine was rewritten mid-work: the first version of the
rotation-timing test proxied `Symbol.iterator`, which proved nothing about
whether both keys were compared. Replaced with a per-element read count.

## A Regression I Introduced, Caught Before The Push

The entropy floor would have **stopped the E2E server from booting in CI**.

`pnpm e2e:ci` is `pnpm build && pnpm e2e:matrix`, and Playwright's `webServer`
runs `pnpm start` when `CI` is set — that is `NODE_ENV=production`.
`playwright.config.ts:79` injects `INTERNAL_API_KEY: resolveInternalApiKey(...)`,
which falls back to `DEFAULT_INTERNAL_API_KEY` when nothing else is
configured. That fixture was **21 characters**, below the new production
floor, so `validateInternalApiKeyConfigValues` would have thrown at startup.

No unit test could see this: the failure happens in a separate process, at
boot, in a mode the unit runner never enters. Same class as the missing
migration-journal entry in Case 6 — a production-mode gate that the local
suite does not exercise.

Fixed by lengthening the fixture to 41 characters and naming it
`e2e-fixture-internal-api-key-not-a-secret`, plus
`e2e/internal-api-key.test.ts`, which asserts the fixture against
`MIN_INTERNAL_API_KEY_LENGTH` itself rather than a copied number. Verified to
fail when the old value is restored.

## Quality Gates

| Gate                        | Command                    | Result                                |
| --------------------------- | -------------------------- | ------------------------------------- |
| Typecheck                   | `pnpm typecheck`           | ✅                                    |
| Lint (with fix)             | `pnpm lint --fix`          | ✅ 0 errors, 12 pre-existing warnings |
| Unit tests                  | `pnpm test`                | (recorded at close)                   |
| DB integration tests        | `pnpm test:db`             | (recorded at close)                   |
| Circular / unused deps, env | skott, depcheck, env:check | (recorded at close)                   |

**Not run in this session**: Playwright E2E. `e2e/security.spec.ts` sends
`x-internal-key: 'invalid-key'` and expects a rejection, which still holds;
`e2e/authjs-auth.ts` sends the configured key, which still holds. Read from
the specs, not observed from a run.

## Deployment Action Required Before Merge

`INTERNAL_API_KEY` must be **at least 32 characters** when
`NODE_ENV=production`. If the current Vercel value is shorter, the build will
fail env validation — same fail-fast class as `DEPLOYMENT_PROXY` in SEC-43.
The owner is told before the push.

## Residual Risk / Follow-Ups

- `PE-21` — request signing and service identity, with the trigger above.
- The limiter is inert outside production (`redis` is only constructed when
  `NODE_ENV=production` and Upstash credentials exist). Intentional: E2E sends
  a deliberately invalid key, and locking that out would break the suite.
