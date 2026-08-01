# 05 - Validation Strategy - Summary

## Task Context

- Task ID: `2026-08-01-vercel-prebuilt-deploy-root-cause`
- Task Objective: Validate Variant A for the Vercel prebuilt deploy incident.
- Mode: CHANGE VALIDATION
- Status: CLOSED LOCALLY; production deployment proof pending after merge.
- Last Updated: 2026-08-01
- Related Control Artifacts: `plan.md`, `04 - Implementation Agent - Summary.md`

## Current-State Findings

- The final validator now checks `Object.values(filePathMap)`, matching the
  Vercel Build Output source-path contract.
- Sanitizer-based validation is removed. Forbidden metadata references are
  reported, and the dry-run guard fails closed if any forbidden source reaches
  the upload plan.
- The production workflow validates the local artifact and dry-run upload
  coverage before real `vercel deploy --prebuilt --prod`.
- Vercel CLI is pinned through `package.json` and lockfile.
- A fresh clean artifact passes dry-run upload coverage and both enforced budgets.

## Validation Performed

- Focused validator coverage passed: `13` tests. Earlier Vercel helper coverage
  remains `10` passing tests, for `23` focused tests across `2` files.
- Focused ESLint passed on changed TypeScript files.
- TypeScript passed with `pnpm exec tsc --noEmit --pretty false`.
- Prettier check passed on changed formatted files.
- Pinned CLI check returned `58.4.4`.
- Fresh dry-run upload coverage passed: `11292` traced source references, `4365`
  upload files, `73499700` bytes, `0` missing allowed references, and `0`
  forbidden uploads. Budgets: `5000` files and `83886080` bytes.
- `git diff --check` passed.

## Validation Not Performed

- Production migration execution was not run. A fresh `vercel build --prod`
  used a temporary local config that deliberately skipped migrations.
- Real `vercel deploy --prebuilt --prod` was not run.
- Full repository `pnpm lint --fix` was skipped at the user's final direction;
  an earlier attempt was interrupted after remaining silent. Focused ESLint for
  the changed TypeScript files had already passed.

Reason: the configured Vercel build command also runs production migrations.
Those proof steps should run only in a controlled deployment session.

## Recommended Production Proof

- Run the updated production workflow.
- Confirm `Validate Prebuilt Artifact Contract` passes after fresh
  `vercel build --prod`.
- Confirm `Validate Prebuilt Upload Coverage` reports `0` missing allowed
  references, `0` forbidden uploads, and metrics within both budgets.
- Confirm the real production deploy succeeds and the deployment status is ready.

## Closure

Local validation is complete for this PR. Leantime remains open in `Do oceny`
because the final acceptance signal is the post-merge production workflow run.
