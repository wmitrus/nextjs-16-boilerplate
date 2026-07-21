# Plan — Login Upstash Investigation

## Task ID

`2026-06-28-login-upstash-investigation`

## Status

**COMPLETED**

## Goal

Identify why local login is failing after the dev server started, determine whether Upstash-backed rate limiting or its fallback path is involved, and either isolate the root cause for a focused fix or produce a precise blocker report.

## Steps

- [x] Step 1: Read repository workflow and auth-flow constraints
- [x] Step 2: Gather initial Upstash and rate-limit evidence from code and logs
- [x] Step 3: Open Leantime task and record tracking metadata
      Leantime milestone `72` (`Leantime Artifact Hygiene And Full Audit`) and task `82` (`Fix local login slowdown from Upstash rate limiting`) were created retroactively and closed after completion. Logged `1.50 h` on `2026-07-01`.
- [x] Step 4: Run Debug Investigation on the auth/login execution path
- [x] Step 5: Consolidate constraints and decide whether implementation is required
- [x] Step 6: Implement focused fix if the root cause is local code
- [x] Step 7: Run focused validation and record residual risk

## Planned Specialist Sequence

1. `10 - Leantime Integration`
2. `06 - Debug Investigation`
3. `02 - Security & Auth` if the failure path crosses auth trust or redirect enforcement
4. `03 - Next.js Runtime` if the failure path depends on App Router or proxy runtime behavior
5. `04 - Implementation Agent` only if a concrete local fix is identified
6. `05 - Validation Strategy` only if validation scope widens beyond obvious focused checks

## Artifact List

- [x] `plan.md`
- [x] `intake.md`
- [x] `06 - Debug Investigation - Summary.md`
- [ ] `constraints.md`
- [ ] `implementation-plan.md` if code changes are needed
- [x] `04 - Implementation Agent - Summary.md` if code changes are needed
- [x] `validation-report.md`

## Resolution Summary

- Leantime tracking is now synchronized: milestone `72`, task `82`, status `Zrobione`.
- Login requests were paying the full Upstash timeout cost in local development because `src/shared/lib/rate-limit/rate-limit.ts` enabled the Upstash limiter whenever credentials existed in `.env.local`.
- The controlling path was `src/proxy.ts` -> `src/security/middleware/with-rate-limit.ts` -> `src/shared/lib/rate-limit/rate-limit-helper.ts` -> `src/shared/lib/rate-limit/rate-limit.ts` and `src/app/api/auth/[...nextauth]/route.ts` for the credentials-specific checks.
- The local fix was to gate Upstash rate limiter initialization to production runtime only, restoring the repository's documented local in-memory behavior.
- Focused validation passed: targeted Vitest specs succeeded and live auth endpoints dropped from ~1.5 s latency to ~0.05-0.23 s on the running dev server.
