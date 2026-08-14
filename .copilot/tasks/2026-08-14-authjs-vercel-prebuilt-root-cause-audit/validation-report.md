# Validation Report

## Passed

- `pnpm exec vitest run --config vitest.unit.config.ts scripts/validate-vercel-deploy-profiles.test.ts scripts/validate-vercel-prebuilt-artifact.test.ts scripts/vercel/cli.test.ts --coverage.enabled=false`: 58 tests.
- `pnpm typecheck`.
- `pnpm vercel:deploy:validate`.
- `NEXT_TELEMETRY_DISABLED=1 pnpm build`: successful, 16 workers, 55/55 pages.
- Next NFT inspection: 70 traces include the required `file-logger.js`.
- `git diff --check` during implementation.

## Intentionally Skipped

- ESLint, due to the active repository agent-shell blocker.
- Local `vercel build --prod`, because the pulled Vercel project build command
  runs `pnpm db:migrate:prod` against Production before `pnpm build`. Running it
  merely to inspect packaging would mutate Production data.

## Pending CI Evidence

- fresh Preview remote build and hosted smoke;
- fresh Production prebuilt `filePathMap` and dry-run validation;
- staged Production smoke before promotion;
- promoted Production smoke and clean Vercel runtime logs.

The implementation is locally validated, but the hosted incident must not be
called fully resolved until the immutable deployed artifacts pass those gates.
