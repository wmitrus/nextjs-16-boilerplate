# 04 - Implementation Agent - Summary

## Task Context

- Task ID: `2026-08-01-vercel-prebuilt-deploy-root-cause`
- Task Objective: Implement Variant A for the Vercel prebuilt deploy incident.
- Current Run Scope: Contract-aligned prebuilt deployment remediation.
- Status: IMPLEMENTATION COMPLETE; Leantime remains `Do oceny` for post-merge production verification.
- Last Updated: 2026-08-01
- Related Control Artifacts: `plan.md`, `production-remediation-options.md`

## Scope Handled

- Added supported route-level Next.js tracing excludes for non-runtime repository
  paths without mutating generated Build Output.
- Replaced manual `.vercelignore` package allowlisting with root-only excludes
  for env, logs, source, tests, docs, reports, and other non-runtime artifacts.
- Removed `vercel:prebuilt:sanitize` and the code path that mutates generated
  `.vc-config.json`.
- Pinned Vercel CLI to exact dev dependency `vercel@58.4.4`.
- Changed deploy workflows and Vercel helper defaults to use the repository
  pinned CLI instead of `vercel@latest`.
- Rewrote the prebuilt validator to treat `Object.values(filePathMap)` as source
  paths.
- Added fail-closed checks for missing source paths, source paths outside the
  repository root, symlink escapes, allowed-source upload gaps, and forbidden
  sources present in the final dry-run upload plan.
- Added enforced upload budgets of `5000` files and `83886080` bytes.

## Files Changed

- `.vercelignore`
- `.github/workflows/prod-deploy.yml`
- `.github/workflows/preview-deploy.yml`
- `next.config.ts`
- `package.json`
- `pnpm-lock.yaml`
- `scripts/validate-vercel-prebuilt-artifact.ts`
- `scripts/validate-vercel-prebuilt-artifact.test.ts`
- `scripts/vercel/cli.ts`
- `scripts/vercel/cli.test.ts`

## Validation Performed

- `pnpm exec vitest run --config vitest.unit.config.ts scripts/validate-vercel-prebuilt-artifact.test.ts scripts/vercel/cli.test.ts --coverage.enabled=false`
- `pnpm exec eslint --fix scripts/validate-vercel-prebuilt-artifact.ts scripts/validate-vercel-prebuilt-artifact.test.ts scripts/vercel/cli.ts scripts/vercel/cli.test.ts next.config.ts`
- `pnpm exec tsc --noEmit --pretty false`
- `pnpm exec prettier --check .github/workflows/prod-deploy.yml .github/workflows/preview-deploy.yml package.json scripts/validate-vercel-prebuilt-artifact.ts scripts/validate-vercel-prebuilt-artifact.test.ts scripts/vercel/cli.ts scripts/vercel/cli.test.ts next.config.ts .copilot/tasks/2026-08-01-vercel-prebuilt-deploy-root-cause/plan.md`
- `pnpm exec vercel --version` returned `58.4.4`
- `pnpm vercel:prebuilt:validate` passed on the available `.vercel/output`
- `pnpm exec vercel deploy --prebuilt --prod --dry --json` plus
  `pnpm vercel:prebuilt:validate -- --dry-run-json ...` passed on a fresh clean
  build with `11292` traced references, `4365` upload files, `73499700` bytes,
  `0` missing allowed references, and `0` forbidden uploads.
- `git diff --check`

## Validation Not Completed

- Full repository `pnpm lint --fix` was started and left running without output
  for over two minutes, matching the earlier hang behavior. It was interrupted
  to avoid leaving a background process. Focused ESLint on the changed
  TypeScript files passed.

## Residual Risk

Fresh `vercel build --prod` was run with a temporary local config that skips
production migrations. Real production deployment proof was not run because the
repository's production flow also runs migrations:

```shell
DATABASE_URL="$DATABASE_URL_UNPOOLED" pnpm db:migrate:prod && pnpm build
```

The production workflow now runs the new guards before the real deploy, so the
remaining proof should be collected either by a controlled workflow run or by an
explicitly approved local production build/deploy session.

## Closure

Local implementation work is complete and `.copilot` artifacts are closed. The
Leantime task remains open in `Do oceny` until the merged production workflow
proves fresh build, guard, dry-run coverage, and real deploy success.
