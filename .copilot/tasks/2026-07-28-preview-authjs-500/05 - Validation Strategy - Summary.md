# 05 - Validation Strategy - Summary

## Objective

Define and record the minimum meaningful validation for the AuthJS preview incident fix.

## Mode

Mode 2: Change Validation.

## Current-State Findings

- The change is env-sensitive and auth-sensitive.
- Unit tests are appropriate for the production env guard.
- Typecheck is required because the validator signature changed.
- `pnpm e2e:authjs:core` is required for AuthJS auth-flow confidence because it covers session JSON health and incomplete-user onboarding.

## Recommended Validation Scope

Minimum required:

- Focused env unit tests for `src/core/env.ts` and `scripts/validate-env.ts`.
- TypeScript check.
- `pnpm lint --fix`.
- `pnpm e2e:authjs:core`.

Optional:

- Live Vercel log inspection after refreshing `VERCEL_TOKEN`.
- Preview smoke after redeploy with corrected env/build command.

Explicitly not required:

- Full E2E matrix; this patch does not alter Clerk/bootstrap/onboarding logic.
- DB adapter tests; no DB code or schema changed.

## Risks And Tradeoffs

The local proof validates repository AuthJS behavior and prevents the missing-secret class. It cannot prove the existing preview deployment is fixed until Vercel env and build-command settings are corrected and redeployed.
