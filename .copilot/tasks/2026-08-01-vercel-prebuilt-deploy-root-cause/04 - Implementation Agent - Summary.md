# 04 - Implementation Agent - Summary

## Task Context

- Task ID: `2026-08-01-vercel-prebuilt-deploy-root-cause`
- Task Objective: Implement Variant A for the Vercel prebuilt deploy incident.
- Current Run Scope: Contract-aligned prebuilt deployment remediation.
- Status: IMPLEMENTATION COMPLETE; Leantime remains `Do oceny` for workflow preview and post-merge production verification.
- Last Updated: 2026-08-01
- Related Control Artifacts: `plan.md`, `production-remediation-options.md`

## Scope Handled

- Added supported route-level Next.js tracing excludes for non-runtime repository
  paths without mutating generated Build Output.
- Replaced manual `.vercelignore` package allowlisting with root-only excludes
  for env, logs, source, tests, docs, reports, and other non-runtime artifacts.
- Removed `vercel:prebuilt:sanitize` and the code path that mutates generated
  `.vc-config.json`.
- Changed deploy workflows and Vercel helper defaults to resolve
  `vercel@latest` through `pnpm dlx` for each invocation.
- Rewrote the prebuilt validator to treat `Object.values(filePathMap)` as source
  paths.
- Added fail-closed checks for missing source paths, source paths outside the
  repository root, symlink escapes, allowed-source upload gaps, and forbidden
  sources present in the final dry-run upload plan.
- Added enforced upload budgets of `5000` files and `83886080` bytes.
- Split the shared upload policy into a preview-safe default `.vercelignore`
  and a production-only `.vercelignore.prebuilt` profile.
- Added a preview source-upload dry-run guard that requires the Next.js config,
  package manifest, and generated migration journal before real deployment.

## Files Changed

- `.vercelignore`
- `.vercelignore.prebuilt`
- `.github/workflows/prod-deploy.yml`
- `.github/workflows/preview-deploy.yml`
- `next.config.ts`
- `package.json`
- `pnpm-lock.yaml`
- `scripts/validate-vercel-prebuilt-artifact.ts`
- `scripts/validate-vercel-prebuilt-artifact.test.ts`
- `scripts/validate-vercel-deploy-profiles.ts`
- `scripts/validate-vercel-deploy-profiles.test.ts`
- `scripts/vercel/cli.ts`
- `scripts/vercel/cli.test.ts`

## Validation Performed

- `pnpm exec vitest run --config vitest.unit.config.ts scripts/validate-vercel-prebuilt-artifact.test.ts scripts/vercel/cli.test.ts --coverage.enabled=false`
- `pnpm exec eslint --fix scripts/validate-vercel-prebuilt-artifact.ts scripts/validate-vercel-prebuilt-artifact.test.ts scripts/vercel/cli.ts scripts/vercel/cli.test.ts next.config.ts`
- `pnpm exec tsc --noEmit --pretty false`
- `pnpm exec prettier --check .github/workflows/prod-deploy.yml .github/workflows/preview-deploy.yml package.json scripts/validate-vercel-prebuilt-artifact.ts scripts/validate-vercel-prebuilt-artifact.test.ts scripts/vercel/cli.ts scripts/vercel/cli.test.ts next.config.ts .copilot/tasks/2026-08-01-vercel-prebuilt-deploy-root-cause/plan.md`
- At the original validation point, `pnpm exec vercel --version` returned
  `58.4.4`; this is historical evidence, not a future version pin.
- `pnpm vercel:prebuilt:validate` passed on the available `.vercel/output`
- `pnpm exec vercel deploy --prebuilt --prod --dry --json` plus
  `pnpm vercel:prebuilt:validate -- --dry-run-json ...` passed on a fresh clean
  build with `11292` traced references, `4365` upload files, `73499700` bytes,
  `0` missing allowed references, and `0` forbidden uploads.
- `git diff --check`
- `pnpm exec vitest run --config vitest.unit.config.ts scripts/validate-vercel-prebuilt-artifact.test.ts scripts/vercel/cli.test.ts scripts/validate-vercel-deploy-profiles.test.ts --coverage.enabled=false` (`35` passed)
- `pnpm vercel:deploy:validate`
- Real preview `vercel deploy --dry --json` validated through
  `pnpm vercel:deploy:validate -- --preview-dry-run-json ...`: `626` source
  files observed and the generated migration journal present.
- Production profile activation simulation plus artifact and upload guards:
  `4365` files, `73499700` bytes, `0` missing allowed references, and `0`
  forbidden uploads.
- `pnpm typecheck` passed after the split-profile implementation.
- Focused `pnpm exec eslint --fix` passed for the two new validator files.
- Changed-file Prettier checks and `git diff --check` passed.

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

The preview and production workflows now run lifecycle-specific guards before
their real deploys. Remaining proof is the hosted PR preview deployment and the
post-merge production deployment; local dry-run contracts for both paths pass.

## Closure

Local implementation work is complete and `.copilot` artifacts are closed. The
Leantime task remains open in `Do oceny` until the hosted PR preview proves the
remote source build and the merged production workflow proves fresh build,
guard, dry-run coverage, and real deploy success.

## 2026-08-13 Scope Clarification

- Reviewed `vercel@58.4.4` release metadata: it only records a republish; the
  incident proof remains the direct CLI package comparison and historical upload
  evidence recorded by Debug Investigation.
- Removed the unrelated preview URL-output parsing workaround from the live
  preview workflow and historical preview SDD.
- Kept the preview source-upload dry-run guard because it covers a distinct,
  observed regression where a production-only `/src` ignore rule caused the
  remote preview build to miss the migration journal.
- Removed the fixed CLI dependency at user direction. Workflows and the helper
  now resolve `vercel@latest` through `pnpm dlx`; deployment guards are retained
  as the compatibility boundary for future releases.
- Registry evidence on 2026-08-13: npm dist-tag `latest` is `58.11.0`. The
  local `pnpm dlx` cache executed `58.9.5`; GitHub Actions runs on fresh
  runners and will resolve the current registry tag.
- After removing the old local CLI dependency, the existing `.vercel/output`
  referenced stale `ms@2.1.1` files while the current dependency tree contains
  `ms@2.1.3`. Local prebuilt validation therefore requires a fresh production
  build, which is deferred to the protected workflow because it includes
  production migrations.
