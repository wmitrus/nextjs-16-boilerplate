# 06 - Debug Investigation - Summary

## Task Context

- Task ID: `2026-08-14-vercel-prebuilt-readiness-audit`
- Task Objective: Reconcile all recorded Vercel prebuilt deployment regressions with the live workflows, ignore profiles, validators, and CLI wrapper.
- Current Run Scope: Read-only source and artifact audit plus focused local validation.
- Status: COMPLETED
- Last Updated: 2026-08-14
- Related Control Artifacts: `plan.md`, `intake.md`

## Scope Handled

- symptom or flow investigated: Historical production prebuilt `ENOENT` materialization failures and preview source-upload regressions.
- runtime surfaces investigated: Production and preview GitHub Actions workflows, Vercel prebuilt and preview ignore profiles, generated `filePathMap` validation, dry-run upload parsing, and the Vercel CLI wrapper.
- env or timing questions investigated: Public environment-template handling, one-owner production migrations, and hosted-versus-local proof boundaries.

## Inputs Reviewed

- code paths reviewed: `.github/workflows/prod-deploy.yml`, `.github/workflows/preview-deploy.yml`, `.vercelignore`, `.vercelignore.prebuilt`, `scripts/validate-vercel-prebuilt-artifact.ts`, `scripts/validate-vercel-deploy-profiles.ts`, `scripts/vercel/cli.ts`, `scripts/vercel/prebuilt-env-template-policy.ts`, focused tests, `next.config.ts`, and package scripts.
- logs / diagnostics reviewed: All artifacts under the four requested prior task directories, including the authenticated fresh-build/dry-run report from 2026-08-12.
- tests / task artifacts reviewed: `2026-08-01-vercel-prebuilt-deploy-root-cause`, `2026-08-01-vercel-prebuilt-node-modules-deploy`, `2026-08-12-vercel-prebuilt-trace-investigation`, and `2026-08-13-vercel-prebuilt-env-template` in full.

## Actions Performed

- reproduction attempts performed: None. This audit was intentionally read-only and did not run Vercel build, dry-run, or deploy commands against a remote project.
- execution-path tracing performed: Workflow checkout -> Vercel environment pull -> local `vercel build --prod` -> artifact validation -> prebuilt upload profile activation -> dry-run coverage validation -> real prebuilt deploy.
- source-of-truth tracing performed: Current workflow and validator code were treated as authoritative; previous artifacts supplied historical triggers and validation evidence.
- evidence collection performed: Ran focused deployment-contract tests, active profile validation, and repository type-checking.

## Symptom Summary

- observed symptom: Historical remote Vercel materialization failed with `ENOENT` when generated function metadata referenced sources removed from the prebuilt upload.
- where it surfaces: Vercel output deployment after local build and prebuilt upload selection.
- reproducibility: Historical incidents were deterministic under their respective tracked-file or ignore-profile conditions.
- trigger conditions: A generated `filePathMap` reference survives into `.vc-config.json`, while the active prebuilt upload plan excludes its source path.

## Confirmed Evidence

### Regression Causal-Path Reconciliation

| Historical causal path                                                                                                          | Current control                                                                                                                                                                                                                  | Audit result                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| User `node_modules` ignore excluded pnpm sources required by `filePathMap`, causing OpenTelemetry `ENOENT`.                     | `.vercelignore.prebuilt` does not exclude `/node_modules` or `/.next`; profile validator rejects either rule. The artifact validator uses `Object.values(filePathMap)` and dry-run coverage requires every non-forbidden source. | Addressed for the recorded dependency path. Focused tests cover source-value handling and ignored `node_modules` upload gaps.                   |
| Production source-minimization rule `/src` was shared with preview source deployment, omitting migration inputs.                | Default `.vercelignore` has no `/src` exclusion. Preview dry-run validation requires `next.config.ts`, `package.json`, both required E2E helper imports, and the migration journal.                                              | Addressed. Profile tests cover the migration-journal and E2E-helper omissions.                                                                  |
| Preview remote type-check failed because `playwright.config.ts` imports were excluded with the rest of `e2e/`.                  | Default profile explicitly restores `e2e/env-files.ts` and `e2e/internal-api-key.ts`; preview validator requires both.                                                                                                           | Addressed.                                                                                                                                      |
| Tracked `logs/server.log` entered the Edge Proxy trace while `/logs` was excluded, causing remote `ENOENT`.                     | The tracked file is staged for deletion and absent from the current worktree. The prebuilt profile retains `/logs` exclusion. Historical fresh-build evidence reports no `logs/server.log` trace.                                | Recorded instance addressed, but see High finding: current validator permits an existing forbidden traced source to be omitted from the upload. |
| Prebuilt profile excluded `/src` after the log investigation although current Edge Proxy metadata requires logger source files. | `.vercelignore.prebuilt` no longer excludes `/src`; `src/` is not classified as forbidden; a focused test requires a traced `src/core/logger/edge.ts` source in the dry-run upload.                                              | Addressed.                                                                                                                                      |
| Public Vercel-required `.env.example` template was treated as a credential-bearing env file and blocked.                        | Explicit policy allows only `.env.example`, `.env.leantime.example`, and `.env.leantime-dev.example`; prebuilt profile restores exactly those paths. Other `.env*` sources remain forbidden.                                     | Addressed for the recorded public-template paths.                                                                                               |
| Malformed or changed dry-run output could under-count uploaded files.                                                           | Parser rejects invalid file entries, trailing non-JSON content, and unavailable size data; upload count and size budgets fail closed.                                                                                            | Addressed by focused parser and budget tests.                                                                                                   |
| Production migration was invoked both as a workflow step and through the Vercel project Build Command.                          | Current production workflow has no separate `pnpm db:migrate:prod` step and invokes `vercel build --prod`; a focused invariant test rejects duplicate ownership.                                                                 | Current duplicate execution is addressed.                                                                                                       |

### Focused Validation Evidence

- `pnpm exec vitest run --config vitest.unit.config.ts scripts/validate-vercel-prebuilt-artifact.test.ts scripts/validate-vercel-deploy-profiles.test.ts scripts/vercel/cli.test.ts --coverage.enabled=false`: PASS, 46 tests.
- `pnpm vercel:deploy:validate`: PASS; current preview and production prebuilt profiles are structurally valid.
- `pnpm typecheck`: PASS.
- ESLint was not run because repository instructions prohibit it while the documented agent-shell hang remains unresolved.

## Execution Path

- entry point: Push to `main` starts the production workflow; pull requests start the preview workflow.
- critical path: Production pulls Vercel Production environment, validates env requirements, builds through `vercel build --prod`, validates generated artifact sources, switches to `.vercelignore.prebuilt`, produces a prebuilt dry-run JSON plan, validates upload closure and budgets, then performs `vercel deploy --prebuilt --prod`.
- state transitions: Source checkout and installed dependencies -> generated `.vc-config.json` source values -> filtered dry-run upload path set -> remote Vercel materialization.
- failure boundary: A source path required by Vercel function metadata but absent from the final upload plan causes remote materialization failure.

## Source-of-Truth Analysis

- Generated `.vc-config.json` `filePathMap` values are the Vercel-required source paths. The current validator correctly evaluates values rather than target keys.
- The final dry-run upload plan is the only local evidence that the chosen Vercel CLI version will upload the required paths; local file existence alone is insufficient.
- The Vercel Project Build Command is the intended production migration owner. The live workflow delegates by calling `vercel build --prod` and currently contains no second migration step.
- Current code differs from older planning artifacts that call for a pinned Vercel CLI and `pnpm dlx`: active workflow and wrapper commands use `npm exec --yes vercel@latest --`. This is documentation/decision drift, not evidence that the historical `node_modules` path currently recurs. Each run still requires the dry-run gate to pass for the freshly resolved CLI.

## Hypotheses And Failure Points

### High Finding: Forbidden Trace Metadata Can Still Bypass Upload-Closure Validation

- Confirmed: `validateVercelPrebuiltUploadCoverage()` excludes every `isForbiddenTracePath()` reference from `allowedRequiredFiles` before checking for upload coverage.
- Confirmed: `assertVercelPrebuiltArtifactValid()` rejects only missing sources, not existing forbidden trace metadata.
- Consequence: If a future existing `/logs/**`, real `.env*`, `docs/**`, `tests/**`, `e2e/**`, report, or other forbidden source is traced by Vercel, the prebuilt profile can omit it and the validator can still pass. Vercel metadata may then require the omitted source during remote materialization, recreating the `logs/server.log` failure mechanism.
- Current containment: The specific tracked `logs/server.log` source is staged for deletion, and historical fresh-build evidence after that deletion found no log trace. This contains the observed incident but does not prove the closure invariant for a future forbidden trace.

### Medium Finding: Floating Vercel CLI Is Intentional but Leaves a Compatibility Window

- Confirmed: The workflow and CLI wrapper resolve `vercel@latest` with `npm exec`; no repository lockfile pins the deployment CLI.
- Confirmed: The dry-run parser and upload coverage checks make the workflow fail closed when the produced plan is incompatible or exceeds the defined shape/budget.
- Residual risk: A future CLI could change behavior before, during, or outside the dry-run JSON contract. The protected workflow needs a fresh successful dry-run and real deployment to establish compatibility for the resolved release.

### Low Finding: Migration-Ownership Regression Test Is Not Invoked by the Deployment Gate

- Confirmed: The migration-ownership assertion exists only in the focused Vitest test; `pnpm vercel:deploy:validate` validates profiles but does not read `prod-deploy.yml` or call `assertVercelProductionMigrationOwnershipValid()`.
- Current state: The live workflow has exactly one migration owner, so this is prevention-gap debt rather than a current duplicate migration.

## Missing Evidence / Uncertainty

- No current-run fresh `vercel build --prod` plus authenticated `--prebuilt --dry --json` was performed. The most recent artifact-backed evidence is from 2026-08-12 using Vercel CLI 59.0.0: 0 missing sources, 0 forbidden uploads, 4,390 files, and 73,496,018 bytes.
- No hosted production workflow/deployment has been observed during this audit. A local dry-run cannot prove remote deployment creation, migration success, or ready status.
- The actual Vercel Project Build Command is external project configuration. Prior artifact evidence says it owns migrations, but this audit did not pull or inspect the live Vercel project configuration.
- It remains unclear why the Edge Proxy trace previously included logger test siblings. This does not change the requirement that any present `filePathMap` source must be materialized.

## Artifact Synchronization

- `plan.md` updates: None. This audit did not change the task plan.
- `intake.md` updates: None. This audit did not change the task intake.
- `implementation-plan.md` updates: Not applicable.
- specialist artifact updates: Created this sole `06 - Debug Investigation - Summary.md` artifact.

## Handoff Notes

- what the next agent should rely on: The recorded `node_modules`, preview `/src`, preview E2E helper, public-template, malformed dry-run, and duplicate-migration incidents all have matching live controls and focused validation evidence.
- what remains unproven: A fresh protected-workflow build/dry-run with the CLI release resolved at execution time, the external Vercel Build Command state, and a completed hosted production deployment.
- recommended next specialist or step: `03 - Next.js Runtime` should assess whether permitting forbidden generated trace metadata is valid under Vercel materialization semantics. `05 - Validation Strategy` should decide the minimum hosted proof and whether the migration-ownership invariant belongs in the deploy-time validator.

## Update Log

### 2026-08-14 - Hosted Production False Negative

- Trigger: Production workflow run `31806827731` failed after Vercel reported the real prebuilt deployment ready.
- Evidence: build succeeded; artifact validator reported 11,054 trace references with no missing sources; dry-run closure passed with 4,390 files and 73,495,645 bytes; Vercel deployment completed as `READY`/`production`.
- Root cause: `vercel inspect --wait --json` omitted `prebuilt`, while the GitHub Actions inline assertion required `deployment.prebuilt === true`.
- Resolution: removed the unsupported inspect field assertion; retained prebuilt proof on the real deploy command plus dry-run gate; added contract tests that distinguish the real deploy from a dry-run and forbid reintroducing `deployment.prebuilt`.
- Residual condition: run the corrected workflow once from the target SHA before closing the Production readiness task.

### Update Entry

- Date: 2026-08-14
- Trigger: Investigation's high forbidden-trace finding was remediated.
- Summary of change: Existing forbidden trace metadata now fails the artifact validator before a dry-run can omit it. The live Project Build Command was read and confirms one migration owner; a post-deploy READY/production/prebuilt inspection gate now closes the prior hosted-readiness visibility gap.
- Sections refreshed: regression reconciliation, missing evidence, and handoff conditions.

### 2026-08-14 - Read-Only Readiness Audit

- Trigger: Requested reconciliation of all recorded Vercel prebuilt regressions against current implementation.
- Summary of change: Audited all requested prior task artifacts and live deployment surfaces, ran focused guard tests/profile validation/typecheck, identified a remaining forbidden-trace closure gap and version-policy drift, and recorded hosted-proof limits.
- Sections refreshed: All sections.
