# Validation Report

## Passed

- `pnpm exec vitest run --config vitest.unit.config.ts scripts/validate-vercel-deploy-profiles.test.ts scripts/validate-vercel-prebuilt-artifact.test.ts scripts/vercel/cli.test.ts --coverage.enabled=false`: 61 tests.
- `pnpm typecheck`.
- `pnpm vercel:deploy:validate`.
- `NEXT_TELEMETRY_DISABLED=1 pnpm build`: successful, 16 workers, 55/55 pages.
- Controlled Next NFT inspection: automatic tracing includes `file-logger.js`
  in 69/70 traces; old global excludes reduce that to 1/70 while retaining its
  importer in 69 traces.
- Final trace relation: 69 importers, 69 dependencies, zero broken traces.
- Pinned Vercel CLI wrapped-JSON URL parsing: passed.
- Hosted Playwright discovery: exactly 2 tests in
  `vercel-runtime-smoke.spec.ts`; the previous 109-test selection is eliminated.
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

The corrected implementation is locally validated. The previous manual include
failed hosted packaging and is superseded; the incident remains open until the
new immutable Preview and Production artifacts pass the hosted gates.
