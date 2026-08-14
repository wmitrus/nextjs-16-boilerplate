# 05 - Validation Strategy - Summary

## Task Context

- Task ID: `2026-08-14-vercel-prebuilt-readiness-audit`
- Task Objective: Determine the minimum credible evidence for a production Vercel prebuilt readiness verdict after recurring remote `ENOENT` failures.
- Current Run Scope: Read-only change-validation review of local contract tests, deployment workflows, package scripts, prior evidence, and available working-tree context.
- Mode: CHANGE VALIDATION
- Status: COMPLETED - CONDITIONAL NO-GO PENDING CURRENT-SHA EVIDENCE
- Last Updated: 2026-08-14
- Related Control Artifacts: `plan.md`, `intake.md`

## Scope Handled

- change surfaces assessed: production prebuilt workflow, preview workflow separation, `.vercelignore` profiles, artifact/profile validators, focused tests, package scripts, and prior prebuilt incident evidence.
- validation questions in scope: whether unit/contract, typecheck, fresh authenticated production build, authenticated prebuilt dry-run, and hosted deployment proof form a sufficient readiness chain.
- excluded validation areas: application feature E2E, broad integration/database suites, and production mutation. They do not directly prove Build Output trace closure or hosted prebuilt materialization.

## Inputs Reviewed

- code paths reviewed: `.github/workflows/prod-deploy.yml`, `.github/workflows/preview-deploy.yml`, `.vercelignore`, `.vercelignore.prebuilt`, `scripts/validate-vercel-prebuilt-artifact.ts`, `scripts/validate-vercel-deploy-profiles.ts`, and `scripts/vercel/cli.ts`.
- tests / configs / workflows reviewed: `scripts/validate-vercel-prebuilt-artifact.test.ts`, `scripts/validate-vercel-deploy-profiles.test.ts`, `package.json`, `vitest.unit.config.ts`, `vitest.integration.config.ts`, `playwright.config.ts`, and `.github/workflows/pr-validation.yml`.
- earlier task artifacts reviewed: the 2026-08-01 root-cause/implementation records, the 2026-08-12 production prebuilt validation report, and the 2026-08-13 environment-template investigation.
- current working-tree evidence: the task plan records pre-existing changes, but no current `git status` or current-SHA command output was available to this read-only review. Historical disposable-worktree results therefore cannot be attributed to the present tree.

## Actions Performed

- validation posture review performed: traced the intended lifecycle from Vercel environment pull through build, generated `filePathMap` inspection, authenticated dry-run upload coverage, and real upload.
- risk analysis performed: separated source/contract evidence from Vercel authenticated-plan evidence and from completed hosted-deployment evidence.
- test-level recommendations prepared: focused validator tests are the correct regression net; no broad application suite is required solely for this deployment-readiness verdict.
- command recommendations prepared: current-SHA checks are listed below; no commands or deployment mutations were run during this review.

## Current-State Findings

### CRITICAL

- No hosted production deployment proof is available for the current SHA. The final production workflow step runs `vercel deploy --prebuilt --prod`, but it does not record a deployment URL/ID, call `vercel inspect --wait`, or verify the resulting deployment state. A dry-run proves the planned upload set, not remote output materialization, deployment readiness, or availability. Current verdict: **NO-GO for claiming production prebuilt readiness** until hosted proof exists.

### MAJOR

- The strongest available production evidence is historical: the 2026-08-12 disposable-worktree run built with Production env and Vercel CLI 59.0.0, then passed dry-run closure at 4,390 files and 73,496,018 bytes. It is valuable regression evidence but cannot prove the current working tree, current remote environment, or the CLI version resolved by `vercel@latest` today.
- Production resolves `vercel@latest` separately for pull, build, dry-run, and deployment. The original incident was triggered by a CLI behavior change, so an unpinned resolver is a live reproducibility and false-confidence risk. Fresh build and dry-run must report the resolved version and be performed on the same immutable SHA as the deploy.
- `assertVercelProductionMigrationOwnershipValid()` exists and is unit-tested, but `prod-deploy.yml` does not invoke `pnpm vercel:deploy:validate`. Migration ownership is not enforced as a production workflow gate; a future workflow edit could create a second migration owner without failing the prebuilt validator.

### MINOR

- `pr-validation.yml` correctly excludes deployment-secret-dependent `env:validate`, but it also cannot exercise the production Build Output or authenticated prebuilt upload path. Passing PR validation must not be represented as prebuilt readiness evidence.
- The production workflow validates the upload plan before deployment, while preview validates source upload and metadata after deployment. Their different models are intentional, but preview success is not a substitute for production prebuilt proof.
- Lint is unavailable in this agent shell under the repository’s documented blocker. It is not a substitute for the listed deployment evidence and must be recorded as skipped rather than silently treated as passing.

### INFORMATIONAL

- The focused unit contract suite covers malformed `filePathMap`, source-value rather than target-key interpretation, missing files, repository escape via symlink, dry-run parser shape, missing traced runtime/source paths, forbidden uploads, and file/size budgets.
- The validator explicitly requires every non-forbidden generated trace source to appear in the dry-run plan. This directly covers the recurrence classes documented on 2026-08-01, 2026-08-12, and 2026-08-13: pnpm `node_modules`, traced `src/**`, and tracked public env templates.

## Validation-Risk Assessment

- primary risks: generated Vercel `filePathMap` changes with the CLI/builder; `.vercelignore.prebuilt` excludes a newly traced source; production runtime env diverges from the pulled build env; remote Vercel materialization fails after a dry-run succeeds; and migration execution is duplicated by a later workflow edit.
- confidence gaps: no evidence ties a fresh authenticated build, dry-run, real deploy, and hosted status to one immutable current SHA. No live working-tree status was available in this review.
- false-confidence risks: treating unit tests as Build Output evidence; treating `pnpm typecheck` or PR CI as authenticated deployment validation; treating an older CLI 59.0.0 dry-run as current evidence while resolving `vercel@latest`; treating dry-run JSON as proof of remote deployment; and treating a zero exit from `vercel deploy` without deployment inspection as hosted readiness proof.
- over-validation concerns: broad Playwright, full database, Storybook, and architecture/dependency suites do not reduce the specific prebuilt trace/upload/materialization risk once the existing focused contract tests and required lifecycle checks pass.

## Recommended Validation Scope

### Minimum Required Validation

1. On the exact commit intended for production, run the focused validator contract tests:
   `pnpm exec vitest run --config vitest.unit.config.ts scripts/validate-vercel-prebuilt-artifact.test.ts scripts/validate-vercel-deploy-profiles.test.ts --coverage.enabled=false`.
   This proves local policy behavior, including upload closure and migration-ownership assertions.
2. Run `pnpm typecheck` on that same SHA. This protects the TypeScript validator/workflow-supporting code path; it does not replace runtime evidence.
3. In an isolated clean worktree with authenticated Vercel Production access, run `vercel pull --environment=production`, `pnpm install --frozen-lockfile`, `pnpm env:check`, and `pnpm env:validate` with `APP_ENV=production` and `NODE_ENV=production`.
4. From that exact worktree and pulled Production environment, run a fresh `vercel build --prod`, then `pnpm vercel:prebuilt:validate`. Record the resolved Vercel CLI version, artifact config/reference counts, and zero missing/escaping traces.
5. Activate `.vercelignore.prebuilt`, run authenticated `vercel deploy --prebuilt --prod --dry --json`, and run `pnpm vercel:prebuilt:validate -- --dry-run-json <path>`. Record zero missing allowed references, zero forbidden uploads, an available total byte count, and both budgets within limits.
6. Run one real production prebuilt deployment from the same SHA/profile/CLI/environment. Capture the deployment URL and ID, wait for completion, inspect the resulting deployment, and prove it is production-targeted and `READY`. Inspect logs on failure. This is the only required hosted proof for the prebuilt readiness verdict.

### Optional Additional Validation

- Add a post-deploy production workflow step that captures the deploy URL/ID and invokes `vercel inspect --wait --json`; verify the target, SHA metadata where available, and `READY` state. This converts the required operational proof into a durable CI gate.
- Run a narrow authenticated production smoke probe only when the deployment platform reports `READY` but an application availability/route-health guarantee is also desired. This is application-health evidence, not prerequisite proof of prebuilt upload materialization.
- Add the existing `pnpm vercel:deploy:validate` to the production workflow before build to continuously enforce the one-owner migration policy already unit-tested.

### Validation Explicitly Not Required

- A full Playwright matrix, database integration suite, Storybook suite, Lighthouse audit, or broad repository test run is not required for this narrow readiness verdict. None closes the Vercel Build Output-to-remote-materialization boundary.
- Preview deployment success is not required and cannot substitute for the production prebuilt lifecycle because preview performs a source upload rather than `--prebuilt` deployment.
- Manual inspection of every generated `filePathMap` entry is not required when the fresh validator and authenticated dry-run pass; the validator computes the full closure mechanically.

## Validation Commands / Checks

```shell
pnpm exec vitest run --config vitest.unit.config.ts scripts/validate-vercel-prebuilt-artifact.test.ts scripts/validate-vercel-deploy-profiles.test.ts --coverage.enabled=false
pnpm typecheck
```

```shell
npm exec --yes vercel@latest -- pull --yes --environment=production --token="$VERCEL_TOKEN"
pnpm install --frozen-lockfile
APP_ENV=production pnpm env:check
APP_ENV=production NODE_ENV=production pnpm env:validate
npm exec --yes vercel@latest -- build --prod --token="$VERCEL_TOKEN"
pnpm vercel:prebuilt:validate
cp .vercelignore.prebuilt .vercelignore
npm exec --yes vercel@latest -- deploy --prebuilt --prod --dry --json --token="$VERCEL_TOKEN" > /tmp/vercel-prebuilt-dry-run.json
pnpm vercel:prebuilt:validate -- --dry-run-json /tmp/vercel-prebuilt-dry-run.json
```

```shell
DEPLOY_URL=$(npm exec --yes vercel@latest -- deploy --prebuilt --prod --token="$VERCEL_TOKEN")
npm exec --yes vercel@latest -- inspect "$DEPLOY_URL" --wait --json --token="$VERCEL_TOKEN"
```

- environment prerequisites: clean isolated worktree at the target SHA; Vercel project linkage; authorized production token; Vercel Production environment pulled before validation; and a record of the resolved CLI version. Do not record secret values.
- expected evidence: command exit results, resolved CLI version, artifact and dry-run validator summaries, dry-run budgets, immutable SHA, deployment URL/ID, and final inspected deployment state. Lint remains explicitly skipped because of the documented shell blocker.

## Artifact Synchronization

- `plan.md` updates: none made; the plan remains accurate that hosted proof is pending.
- `intake.md` updates: none made; its readiness checklist still requires focused current-branch checks and final operational evidence.
- `implementation-plan.md` updates: not applicable.
- specialist artifact updates: created this single Validation Strategy summary.

## Open Questions / Blockers

- unresolved questions: Which Vercel CLI version will resolve at the time of the production run, and whether the live Vercel project accepts and materializes the exact current artifact.
- blockers: hosted deployment evidence and current-SHA authenticated execution are absent. This is not blocked by architecture, security/auth, or runtime design decisions; it is blocked by missing operational evidence.
- dependencies on architecture / security / runtime decisions: none for the minimum validation chain. The existing production runtime-env guard correctly avoids the SEC-25 build-only fallback pattern, but the real deployed runtime remains to be proven.

## Handoff Notes

- what the next agent should rely on: the focused validators are behaviorally relevant and historical authenticated dry-runs demonstrate the remediation model can pass. They are not a release certificate for the current SHA.
- what should not be re-decided without new evidence: prebuilt readiness requires the full lifecycle chain, especially hosted deployment proof; dry-run-only sign-off is insufficient.
- recommended next specialist or step: execute the six minimum required checks in an isolated current-SHA worktree, then have the workflow owner capture and inspect a real hosted production deployment before changing this verdict to GO.

## Update Log

### Update Entry

- Date: 2026-08-14
- Trigger: Implementation follow-up converted two recommended controls into executable gates.
- Summary of change: The production workflow now invokes the deployment-profile validator, rejects forbidden generated trace metadata, captures the deployed URL, and requires Vercel inspection to return a ready Production prebuilt deployment. Current-SHA focused-suite, typecheck, and hosted workflow evidence remain required for an unconditional GO.
- Sections refreshed: critical findings, recommended validation scope, and blockers.

### Update Entry

- Date: 2026-08-14
- Trigger: Requested read-only production Vercel prebuilt readiness audit.
- Summary of change: Established a severity-ranked validation assessment and a conditional no-go standard requiring current-SHA lifecycle and hosted-deployment proof.
- Sections refreshed: All.
