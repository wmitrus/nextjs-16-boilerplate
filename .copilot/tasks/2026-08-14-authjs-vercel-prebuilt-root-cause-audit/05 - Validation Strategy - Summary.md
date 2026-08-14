# 05 - Validation Strategy - Summary

## Task Context

- Task ID: `2026-08-14-authjs-vercel-prebuilt-root-cause-audit`
- Mode: Change Validation.
- Status: LOCAL GATES PASSED; hosted gates pending.
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
- The incident remains open until both deployment paths pass on a fresh
  immutable revision.
