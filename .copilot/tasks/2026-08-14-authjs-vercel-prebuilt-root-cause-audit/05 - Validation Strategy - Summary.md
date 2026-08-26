# 05 - Validation Strategy - Summary

## Task Context

- Task ID: `2026-08-14-authjs-vercel-prebuilt-root-cause-audit`
- Mode: Change Validation.
- Status: COMPLETED; local and hosted gates passed.
- Last updated: 2026-08-14.

## Minimum Safe Proof

- Unit proof for deployment-profile guards and relational prebuilt trace checks.
- A controlled A/B production build proving the trace regression and corrected
  dependency closure.
- Typecheck, formatting, repository deployment-profile validation, and a final
  production build capped at 16 workers.
- Fresh source-built Preview proof that packaging completes and hosted AuthJS
  smoke passes.
- Playwright discovery proof that the hosted configuration selects exactly two
  tests from `vercel-runtime-smoke.spec.ts`.
- Fresh staged prebuilt Production proof that artifact closure, dry-run upload,
  immutable runtime smoke, promotion, and canonical smoke pass.

## Result And Residual Risk

- All local gates passed; the A/B test causally distinguishes the old excludes,
  the rejected manual include, and automatic tracing.
- No auth E2E rerun is needed locally because auth behavior was not changed;
  hosted smoke is required because the failure boundary is Vercel packaging and
  function startup.
- Full E2E is explicitly excluded from the hosted smoke because it requires
  scenario-owned credentials, fixtures, and mutable test state.
- Both deployment paths passed on fresh hosted revisions.

## 2026-08-14 Deployment-ID Runtime Update

- Added source-contract tests for custom ID wiring, reserved variable rejection,
  explicit runtime-mode rejection, and the dashboard-env guard.
- Added generated-artifact tests for an embedded valid custom ID, invalid IDs,
  and `runtimeServerDeploymentId: true`.
- Local acceptance: 74 focused tests, typecheck, profile validation, and a
  controlled Next.js config load pass.
- Hosted acceptance remains unchanged in principle: staged immutable smoke must
  pass before promotion, followed by canonical Production smoke. Runtime logs
  must contain neither the earlier missing-module error nor the new missing
  deployment-ID launcher error.

## 2026-08-15 Tenant Readiness Validation

- HAR evidence distinguishes speculative prefetch `404` from the real `307`
  bootstrap decision.
- Runtime logs prove `TENANT_NOT_PROVISIONED` and successful AuthJS callback/session
  behavior.
- A read-only DB snapshot proves one complete existing tenant boundary and a
  mismatched configured tenant ID.
- Unit acceptance: 35 focused checker/workflow tests pass with coverage disabled
  for the focused run.
- Static acceptance: typecheck and `pnpm vercel:deploy:validate` pass.
- Operational acceptance: old Production env fails the new checker; corrected
  re-pulled Production env passes.
- Fresh hosted Preview and Production passed the automated smoke covering
  bootstrap's failure signature (`TENANT_NOT_PROVISIONED` no longer reachable
  under the corrected `DEFAULT_TENANT_ID`). Authenticated admin _use_ was not
  exercised by CI — see `OZI-50`.
