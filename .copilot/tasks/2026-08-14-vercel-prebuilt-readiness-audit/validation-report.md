# Validation Report

## Completed Evidence

- Vercel CLI `59.0.0` documentation and help confirm `inspect --wait --json` with an explicit timeout option.
- Official Vercel deployment documentation confirms `target`, `prebuilt`, `readyState`, and `status` are deployment fields.
- Live Vercel project settings were pulled read-only. The project is Next.js on Node `24.x`; its Build Command is the documented single migration-and-build owner.
- `pnpm exec vitest run --config vitest.unit.config.ts scripts/validate-vercel-prebuilt-artifact.test.ts scripts/validate-vercel-deploy-profiles.test.ts scripts/vercel/cli.test.ts --coverage.enabled=false` passed: 48 tests.
- `pnpm vercel:deploy:validate` passed against the live workflow and upload profiles.
- `pnpm typecheck` passed.
- Prettier passed for the modified workflow, validators, documentation, and audit artifacts; `git diff --check` passed.
- VS Code diagnostics reported no errors for the modified workflow, YAML, and deployment-profile validator files.

## Pending Validation

- Run a protected Production workflow from the target SHA after the inspect-field correction and retain its build, dry-run, and inspected deployment evidence.

## Hosted Incident Evidence

- GitHub Actions run `31806827731` reached a real Vercel prebuilt deployment after a successful build, artifact validation, and dry-run closure.
- Vercel reported the deployment `READY` with target `production`.
- The GitHub Actions job then failed because `vercel inspect --json` omitted `prebuilt`; the workflow compared `undefined` to `true` and produced a false negative.
- The final correction treats `deploy --prebuilt --prod` and the preceding prebuilt dry-run as provenance evidence. The inspect gate now verifies only the observed `READY` and `production` fields.
- Contract tests reject both a real deploy missing `--prebuilt` and any reintroduction of `deployment.prebuilt` into the inspect assertion.

## Explicitly Skipped

- ESLint is skipped because the repository's documented agent-shell execution blocker remains active.
- Local `vercel build --prod` and real deployment are skipped because the live Project Build Command performs the Production migration. The GitHub Actions Production workflow is the intended controlled execution boundary.

## Verdict

The implementation is a conditional GO for merge: the previous Vercel deployment itself was ready, and the false-negative job condition is now corrected with regression coverage. It becomes an unconditional Production-readiness certificate when the target SHA completes the protected workflow with the corrected inspect gate.
