# PR Title

fix(ci): harden Vercel prebuilt deploy artifact upload

# PR Body

## Summary

This PR fixes the production Vercel prebuilt deployment failure by aligning the
deploy pipeline with Vercel's Build Output contract.

The root cause was not New Relic or OpenTelemetry. Vercel CLI `58.4.4` began
applying user `.vercelignore` rules to generated `filePathMap` source paths.
Because this repo ignored `node_modules`, required pnpm-traced files were omitted
from upload while `.vc-config.json` still referenced them, causing remote
materialization to fail with `ENOENT`.

## Changes

- Use the repository-pinned Vercel CLI via `pnpm exec vercel` instead of global
  `vercel@latest`.
- Remove `.vercelignore` rules for `.next` and `node_modules`, which Vercel may
  legally reference from generated prebuilt metadata.
- Keep root-only ignores for env files, logs, source, tests, docs, coverage, and
  reports.
- Remove the prototype sanitizer path; generated `.vc-config.json` is no longer
  modified after build.
- Validate `Object.values(filePathMap)` as Vercel source paths.
- Fail closed when traced source paths are missing, outside the repo, or
  symlink-escaping; require every allowed runtime source in the dry-run upload
  and reject every forbidden source present in that upload.
- Add production workflow guards before the real production prebuilt deploy.
- Enforce dry-run budgets of `5000` files and `83886080` bytes.

## Validation

- `pnpm exec vitest run --config vitest.unit.config.ts scripts/validate-vercel-prebuilt-artifact.test.ts scripts/vercel/cli.test.ts --coverage.enabled=false`
- `pnpm exec eslint --fix scripts/validate-vercel-prebuilt-artifact.ts scripts/validate-vercel-prebuilt-artifact.test.ts scripts/vercel/cli.ts scripts/vercel/cli.test.ts next.config.ts`
- `pnpm exec tsc --noEmit --pretty false`
- `pnpm exec prettier --check .github/workflows/prod-deploy.yml .github/workflows/preview-deploy.yml package.json scripts/validate-vercel-prebuilt-artifact.ts scripts/validate-vercel-prebuilt-artifact.test.ts scripts/vercel/cli.ts scripts/vercel/cli.test.ts next.config.ts .copilot/tasks/2026-08-01-vercel-prebuilt-deploy-root-cause/plan.md`
- `pnpm exec vercel --version` -> `58.4.4`
- `pnpm vercel:prebuilt:validate`
- `pnpm exec vercel deploy --prebuilt --prod --dry --json` +
  `pnpm vercel:prebuilt:validate -- --dry-run-json ...`
- `git diff --check`

Fresh clean dry-run upload baseline:

- `11292` traced source references
- `266` forbidden metadata references excluded from upload
- `4365` uploaded files
- `73499700` bytes
- `0` missing allowed references
- `0` forbidden uploads

## Not Run

- Real `vercel deploy --prebuilt --prod`
- Full repository `pnpm lint --fix`

The fresh local build used a temporary Vercel config that skipped production
migrations. Real production deploy proof is intentionally deferred until after
merge, because the repository's production build command runs migrations:

```shell
DATABASE_URL="$DATABASE_URL_UNPOOLED" pnpm db:migrate:prod && pnpm build
```

Full repository ESLint was explicitly skipped at user request. Focused tests,
typecheck, Prettier, dry-run upload validation, and `git diff --check` passed.

## Post-Merge Verification

- Confirm the production workflow reaches `Validate Prebuilt Artifact Contract`.
- Confirm `Validate Prebuilt Upload Coverage` reports `0` missing allowed
  references and `0` forbidden uploads.
- Confirm upload metrics remain close to the recorded baseline.
- Confirm the real production deploy succeeds and reaches ready status.
