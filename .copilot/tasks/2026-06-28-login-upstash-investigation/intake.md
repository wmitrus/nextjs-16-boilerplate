# Intake — Login Upstash Investigation

## Task ID

`2026-06-28-login-upstash-investigation`

## Request

The user started the local dev server, login is not working as expected, and they suspect issues in the logs related to the Upstash provider.

## Objective

Determine whether the login issue is caused by Upstash-backed rate limiting, a fallback-path bug, an auth-flow regression, or an unrelated runtime failure that merely mentions Upstash.

## Scope

- inspect current code paths involved in auth/login and rate limiting
- inspect available logs and diagnostics for Upstash, Redis, or rate-limit failures
- isolate the controlling failure path and identify the smallest safe next step

## Out Of Scope

- broad auth-flow redesign
- unrelated cleanup in logging, middleware, or auth modules
- large validation expansion unless a specialist recommends it

## Acceptance Criteria

- the likely root cause is tied to specific code paths and evidence
- any proposed fix is scoped to the controlling path rather than a workaround
- focused validation or a clear blocker report is produced

## Verification Sources

- `docs/ai/general/AUTH_FLOW_ANTI_PATTERNS.md`
- `docs/ai/general/AUTH_FLOW_MATRIX_HOW_TO_USE.md`
- `docs/ai/general/AUTH_FLOW_VERIFICATION_MATRIX.md`
- available local logs and diagnostics
- rate-limit and proxy code under `src/`

## Affected Areas

- `src/proxy.ts`
- `src/security/middleware/with-rate-limit.ts`
- `src/shared/lib/rate-limit/**`
- auth/bootstrap routes if the failure path reaches them

## Constraints

- keep the investigation evidence-first
- preserve auth-flow invariants from the matrix and anti-pattern docs
- do not widen into repo-wide test work without validation review
- if the issue is only in local environment/config, report that explicitly rather than changing production code blindly

## Environment / Preconditions

- local dev server has already been started by the user
- current request path and recent logs may still reflect the failure
- workspace may contain prior task artifacts relevant to auth and rate limiting

## Evidence Expectations

- task artifact trail with current status
- specialist summary for Debug Investigation
- direct reference to the controlling code path and log evidence
- validation report if a code change is made

## Open Questions

- what exact user account or credential state failed during the original login attempt

## Readiness Checklist

- [x] Workflow and auth-flow rules loaded
- [x] Initial Upstash and rate-limit code surface identified
- [x] Leantime task created or linked
- [x] Debug Investigation artifact recorded
- [x] Root cause confirmed
- [x] Fix implemented or blocker documented

## Outcome Snapshot

- Leantime tracking is now synchronized under milestone `72` (`Leantime Artifact Hygiene And Full Audit`) with task `82` (`Fix local login slowdown from Upstash rate limiting`), closed with `1.50 h` logged on `2026-07-01`.
- Confirmed the local environment was running `AUTH_PROVIDER=authjs` with Upstash credentials present in `.env.local`.
- Confirmed auth endpoints returned `200` but each incurred ~1.5 s latency, matching `UPSTASH_RATE_LIMIT_TIMEOUT_MS`.
- Confirmed the configured Upstash host could not be resolved from the local machine, so every auth rate-limit check fell back after timeout.
- Implemented a production-only gate for Upstash limiter initialization so local development uses the documented in-memory limiter even when credentials are present.
- Post-fix live checks showed `api/auth/session`, `api/auth/providers`, and `api/auth/csrf` responding in ~0.05-0.23 s.
