# Intake — Admin AuthJS E2E Worker Root Cause

## Task ID

`2026-06-28-admin-authjs-e2e-worker-root-cause`

## Request

The user needs:

1. hard proof why the focused admin AuthJS E2E suite passes with `--workers=1` but not with `--workers=16`
2. an answer whether the current code has a real chance of passing at `16` after the recent helper changes
3. the true root cause, not a guessed explanation
4. if `16` still does not work, whether the suite can be adjusted to work at `8`, based on the real root cause

## Known Context At Start

- Focused AuthJS core browser slice passed.
- Focused admin browser suite passed with `--workers=1`.
- Focused admin browser suite failed under default high parallelism.
- Recent changes already landed in:
  - `e2e/authjs-auth.ts`
  - `scripts/e2e/run-scenario.mjs`

## Evidence Goals

- prove whether the failures come from rate limiting, bcrypt/CPU saturation, startup timing, sign-in helper race conditions, or another route-specific bottleneck
- compare behavior across worker counts with the same scenario runner and database profile
- tie the final explanation directly to repository code and run output

## Readiness Checklist

- [x] Existing admin/AuthJS E2E files identified
- [x] Existing auth callback route identified
- [x] Existing scenario runner identified
- [x] Controlled comparison runs completed
- [x] Root-cause evidence captured
- [x] Final conclusion recorded
