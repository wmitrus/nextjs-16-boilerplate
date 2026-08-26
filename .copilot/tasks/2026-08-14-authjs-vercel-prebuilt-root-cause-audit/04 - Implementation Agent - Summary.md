# 04 - Implementation Agent - Summary

## Task Context

- Task ID: `2026-08-14-authjs-vercel-prebuilt-root-cause-audit`
- Status: COMPLETED; hosted Preview and Production confirmed.
- Last updated: 2026-08-14.

## Changes

- Removed both custom output tracing options from `next.config.ts` while
  preserving the 16-worker cap and deployment ID.
- Changed the config guard to reject repository-wide tracing overrides.
- Made prebuilt validation relational: `console-file.js` requires
  `file-logger.js`, avoiding a version-specific requirement for unrelated Node
  functions.
- Changed Preview and Production workflows to invoke the pinned local Vercel CLI
  directly for machine-readable commands.
- Deploy steps now preserve failure status, parse successful `--json` output,
  validate HTTPS, and only then write one URL to `$GITHUB_OUTPUT`.
- Restricted the hosted Playwright configuration to
  `vercel-runtime-smoke.spec.ts`, preventing accidental execution of all 109
  scenario-managed E2E tests.
- Split Preview deployment, hosted runtime smoke, and Lighthouse into separate
  jobs. Runtime smoke consumes the immutable deployment URL and uploads traces
  on failure.
- Added a deployment-profile guard for the focused smoke `testMatch` and the
  separate runtime verification job.
- Updated both the audit artifacts and the original Copilot task with the
  superseding solution.

## Validation

- Focused unit tests and the exact two-test Playwright discovery check passed.
- `pnpm typecheck` passed.
- `pnpm vercel:deploy:validate` passed.
- Prettier and `git diff --check` passed.
- Final `pnpm build` passed with 16 workers and 55/55 pages.
- Final trace relation: 69 importers, 69 dependencies, zero broken traces.
- ESLint was skipped under the active repository blocker.

## 2026-08-14 Deployment-ID Runtime Update

- Replaced `process.env.NEXT_DEPLOYMENT_ID` in `next.config.ts` with
  `process.env.VERCEL_PREBUILT_DEPLOYMENT_ID`.
- Production now generates the custom ID from GitHub run ID plus run attempt and
  fails before build if project configuration supplies reserved
  `NEXT_DEPLOYMENT_ID`.
- Deployment-profile validation rejects reserved build assignment or explicit
  runtime resolution.
- Prebuilt artifact validation requires a valid embedded custom ID and rejects
  `runtimeServerDeploymentId: true`.
- The expected custom ID is job-scoped and the artifact must match it exactly;
  stale or constant IDs and YAML-level assignments of the reserved variable are
  covered by regression tests.

## 2026-08-15 Neon Preview Capacity Guard

- Added a dedicated Neon management CLI with list, preview capacity check, and
  confirmed preview-branch deletion commands.
- Added `scripts/neon/neon.env.example`; local credentials remain isolated from
  Next.js application and build environments without creating a root `.env.*`
  file that Next can trace into server functions.
- Preview CI now checks the Neon API before source upload. At capacity it may
  delete only the oldest `preview/*` branch whose GitHub branch is confirmed
  absent; otherwise it blocks without deleting anything.
- Added deployment-profile guards and focused unit coverage for safe cleanup
  candidate selection.
- Hardened both provider HTTP sinks with a closed provider allowlist: HTTPS,
  exact origin, exact endpoint family, exact Neon project/GitHub repository
  scope, and rejection of credentials, query, and fragment components.
- A cloud-synchronized Codacy Opengrep rerun reported zero HTTP/SSRF findings;
  its two remaining findings are unrelated pre-existing workflow warnings.

## 2026-08-15 Production Tenant Readiness Gate

- Added `scripts/validate-tenant-readiness.ts`, a read-only Drizzle check for the
  single-tenant runtime/data contract.
- Added local and Vercel Production package commands.
- Production runs the gate after `vercel build --prod` migrations and before
  artifact validation/upload.
- Deployment-profile validation locks in both presence and ordering of the gate.
- Updated the admin bootstrap runbook to distinguish empty DB bootstrap from an
  existing DB with a mismatched `DEFAULT_TENANT_ID`.
- Production Vercel config was aligned to the one existing provisioned tenant;
  no database rows or auth flow code were changed.
