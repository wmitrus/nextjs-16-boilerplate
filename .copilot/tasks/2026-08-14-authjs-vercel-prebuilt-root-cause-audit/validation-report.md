# Validation Report

## 2026-08-15 Preview Provisioning Failure

- GitHub Actions run `31883863182`, deployment
  `dpl_7Xt1jTxQE6MdzDALCTdvsp5rnsWM`, failed in about four seconds with
  `Resource provisioning failed`.
- Vercel's deployment API reported `integrations.status: error`, `builds: []`,
  and an empty builder output. Neither the configured database migration nor
  `pnpm build` started.
- A controlled rerun of the same SHA created deployment
  `dpl_9iZBvT7HhSNeFtGSbDADpigFyVGP` and reproduced the same pre-build failure.
- `vercel integration resource inspect neon-db-boilerplate --format=json`
  confirmed that the Neon Free resource is connected to Production, Preview,
  and Development and has the general status `available`. This does not prove
  that its per-deployment branch action can allocate another Preview branch.
- Vercel and Neon public status pages were operational during the retry. The
  remaining gate is the project-specific Neon deployment action, with branch
  capacity or connection state as the leading provider-side causes.
- No repository code or workflow change is justified by this evidence. Preview
  must remain a source deployment so Neon can inject branch-scoped connection
  details before the remote build.
- Follow-up observability improvement: Preview now runs
  `pnpm vercel:deploy:diagnose` when `vercel deploy` fails. A replay against
  `dpl_9iZBvT7HhSNeFtGSbDADpigFyVGP` correctly reported that integration
  provisioning failed before migrations/build, identified Neon, and printed the
  resource and deployment dashboard links.
- Follow-up prevention improvement: Preview now runs a direct Neon branch
  capacity check before source upload. Focused unit coverage proves automatic
  cleanup excludes the current, default, protected, and GitHub-active branches
  and selects only the oldest verified-obsolete `preview/*` branch.
- `36` focused tests passed across the Neon CLI, deployment diagnostic, and
  deployment-profile validator; TypeScript and profile validation passed.
- After provider URL hardening, `42` focused tests and TypeScript passed.
- Cloud-synchronized Codacy Opengrep completed with two unrelated workflow
  warnings and no finding in `scripts/neon/cli.ts`; both reported HTTP findings
  are cleared without scanner suppression.
- Production prebuilt validation correctly rejected the root
  `.env.neon.example` template after Next traced it into three functions. The
  template moved to `scripts/neon/neon.env.example`; no tracing override or
  forbidden upload exception was added.

## 2026-08-14 Deployment-ID Runtime Correction

- `74` focused validator/helper tests passed.
- `pnpm typecheck` passed.
- `pnpm vercel:deploy:validate` passed outside the restricted IPC sandbox.
- Controlled Next.js config load proved the corrected custom ID is embedded,
  `runtimeServerDeploymentId` is not enabled, and no runtime
  `NEXT_DEPLOYMENT_ID` is required.
- The generated-artifact validator now rejects either a missing/invalid custom
  ID, an ID that differs from the current GitHub run, or
  `runtimeServerDeploymentId: true`.
- A local `pnpm build` reported `cpus: 16` but made no progress for six minutes
  after entering Turbopack compilation and was interrupted to protect WSL. It
  is not recorded as a pass. The authoritative full prebuilt build remains the
  fresh CI `vercel build --prod` gate.
- ESLint remains skipped under the repository's active blocker.
- Hosted staged and promoted Production smoke are still required before closure.

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

## 2026-08-15 Production Tenant Readiness

- HAR inspection proved the visible bootstrap `404`s were speculative RSC
  prefetches; the real route executed and returned the controlled
  `tenant_config` redirect.
- Vercel runtime logs proved `TENANT_NOT_PROVISIONED` after successful AuthJS
  sign-in/session handling.
- A read-only Production DB query proved one complete tenant boundary exists and
  the old Vercel tenant ID did not match it.
- The old pulled Production env failed the new checker with the intended
  duplicate-tenant warning.
- Production-only `DEFAULT_TENANT_ID` was aligned to the existing tenant. A fresh
  env pull passed the checker.
- `36` focused tenant-readiness and deployment-profile tests passed with four
  workers and focused-run coverage disabled.
- `pnpm typecheck`, `pnpm vercel:deploy:validate`, formatting, and
  `git diff --check` passed.
- No local production build was added for this scripts/workflow-only change; the
  existing 16-worker cap and CI prebuilt build remain authoritative.
- Pending: push the change, complete a fresh staged Production deployment, and
  verify authenticated bootstrap settlement on the new deployment.
