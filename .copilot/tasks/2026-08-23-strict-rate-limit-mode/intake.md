# Intake — Strict Rate-Limit Mode (SEC-42)

## Reported Issue (repo owner, Case 12)

> Rate limiter powinien mieć tryb security-critical. Obecny helper przy
> niedostępnym Upstash robi local in-memory fallback. Dla zwykłego API to
> sensowny availability tradeoff. Dla login / password reset / verification /
> invitation abuse to za słabe w serverless, bo różne instancje mają różne
> lokalne liczniki.
>
> Dodałbym `checkRateLimit(identifier, { mode: 'strict' })` gdzie durable
> backend unavailable → fail closed / second durable store.

## Verified Current State

| Endpoint                                  | Runtime               | Endpoint-level limit     | Durability on Upstash failure |
| ----------------------------------------- | --------------------- | ------------------------ | ----------------------------- |
| `withRateLimit` (all `/api`)              | **Edge** (`proxy.ts`) | generic per-IP           | → process-local `Map`         |
| `/api/auth/[...nextauth]` credentials     | Node                  | `checkSignInIpRateLimit` | → process-local `Map`         |
| login-abuse-control (per-account, SEC-34) | Node                  | dual bucket              | → process-local `Map`         |
| `/api/auth/forgot-password`               | Node                  | `checkRateLimit`         | → process-local `Map`         |
| `/api/auth/resend-verification`           | Node                  | `checkRateLimit`         | → process-local `Map`         |
| `/api/auth/waitlist`                      | Node                  | `checkRateLimit`         | → process-local `Map`         |
| **`/api/auth/reset-password`**            | Node                  | **none**                 | —                             |
| **`/api/auth/signup`**                    | Node                  | **none**                 | —                             |
| **`/api/auth/invite`**                    | Node                  | **none**                 | —                             |

Three of the four paths the owner named are worse than described: they have
no endpoint-level limit at all, only the generic Edge per-IP window.

## Hard Constraints Found

1. **`withRateLimit` runs in Edge** (`src/proxy.ts`). The repo's Postgres
   driver is `postgres` (postgres.js), TCP-based and not Edge-compatible;
   there is no `@neondatabase/serverless`. A Postgres-backed secondary is
   therefore available to Node route handlers only.
2. **Every strict endpoint already requires Postgres to do its job** —
   `authorize()` resolves `DrizzleDb` (`auth.ts:49`); forgot-password,
   reset-password, resend-verification, signup and invite all hit the DB.
   So failing closed when _both_ stores are down costs no availability that
   is not already lost.

## Decision Record (repo owner)

| #   | Question              | Decision                                                                                                                                                                          |
| --- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Strict failure policy | **Chain: Upstash → Postgres → fail closed.**                                                                                                                                      |
| 2   | Scope                 | Strict on existing callers **plus** add rate limiting to the three unprotected endpoints (reset-password, signup, invite). **Edge middleware deferred** to a later analysis plan. |
| 3   | Kill-switch           | Env var **plus** a feature-flag override — owner asked whether FF-first-then-env is architecturally sound, and for a professional design.                                         |

## Architecture Guard Correction (recorded, because it changed the design)

An earlier statement in this session implied the repo's feature flags are not
runtime-togglable. **That was misleading and the owner was right to push
back.** `DrizzleFeatureFlagService.isEnabled()` issues a fresh `SELECT` on
every call, with no cache, and the admin GUI writes the same
`featureFlagsTable` — so with `FEATURE_FLAG_PROVIDER=db` a toggle takes
effect on the next request, exactly like GrowthBook. Redeploy is required
only for `provider=static`, where flags live in `FEATURE_FLAGS_STATIC` (an
env var) — and `static` happens to be the current default (`env.ts:233`).

This also narrows the earlier circularity objection. A DB-backed switch is
unreachable only when Postgres is down, and that is precisely the scenario
where these endpoints are dead anyway. For the risk that actually matters —
_the new Postgres counter itself misbehaving while Postgres is up_ — the
DB-backed flag works.

## Design Consequence — the override must be one-directional

`FeatureFlagService.isEnabled()` returns `Promise<boolean>`; there is no
third state. `ResilientFeatureFlagService` returns `false` when its delegate
throws (asserted by its own test). So "flag unreachable" and "flag set to
false" are indistinguishable.

A two-directional override would therefore silently overwrite the env default
in an arbitrary direction whenever the provider is unreachable. The override
is consequently defined as **loosen-only**:

```
degrade = (override === true) ? true : envDefault
```

An unreachable override can never relax a security control — it falls back to
the env default, which is `enforce`.
