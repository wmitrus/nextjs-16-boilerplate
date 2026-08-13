# 06 - Debug Investigation - Summary

## Task Context

- Task ID: `2026-08-01-vercel-prebuilt-deploy-root-cause`
- Task Objective: Establish the evidence-backed root cause of the production Vercel prebuilt deployment failure and explain why it first appeared at this deployment boundary.
- Current Run Scope: Historical boundary identification, deployment execution-path tracing, Build Output/upload consistency checks, hypothesis discrimination, and final remediation-direction synchronization.
- Status: COMPLETE
- Last Updated: 2026-08-01
- Related Control Artifacts: `plan.md`, `intake.md`

## Scope Handled

- symptom or flow investigated: `vercel deploy --prebuilt --prod` failing remotely with `ENOENT` for a pnpm-managed dependency path
- runtime surfaces investigated: production GitHub Actions workflow, Vercel CLI prebuilt file collection, Build Output API `filePathMap`, historical Vercel deployment file trees, and remote deployment-file materialization
- env or timing questions investigated: Vercel CLI release boundary, unpinned `vercel@latest`, project `rootDirectory`, pnpm and Next.js version changes, and previous-build-cache availability

## Inputs Reviewed

- code paths reviewed: `.github/workflows/prod-deploy.yml`, incident-era `.vercelignore`, Vercel CLI `@vercel/client` prebuilt `buildFileTree` implementations from `53.1.1`, `54.18.1`, `58.4.0`, and `58.4.4`, and upstream Vercel commit `682bf8b47f73936d51cb236391e7fe34b1cade00`
- logs / diagnostics reviewed: immutable Actions logs for production runs `25424497876`, `28334191471`, `30701639589`, `30703999851`, and `30708105742`; successful and failed Vercel deployment metadata/file trees
- tests / task artifacts reviewed: task intake and plan; immutable npm packages spanning Vercel CLI `53.1.1` through `58.4.4`

## Actions Performed

- reproduction attempts performed: package-level comparison of the actual published Vercel CLI bundles; exact ignore-filter implementation absent through `58.4.0` and present in `58.4.4`
- execution-path tracing performed: workflow install -> local `vercel build --prod` -> generated `.vc-config.json` `filePathMap` -> `vercel deploy --prebuilt` file collection -> upload -> remote file retrieval
- source-of-truth tracing performed: generated `filePathMap` owns raw function
  source-to-bundle metadata; the deployment upload plan must include every
  allowed runtime source and exclude every forbidden repository source
- evidence collection performed: opened Leantime milestone `97` / task `98`; recovered historical Actions logs and deployment trees; compared published CLI bundles; identified and inspected the exact upstream security change

## Symptom Summary

- observed symptom: remote Vercel deployment-file retrieval attempted `lstat` on an OpenTelemetry source path retained in function `filePathMap`, but Vercel CLI had omitted that source file from the upload
- where it surfaces: remote build stage after upload by `vercel deploy --prebuilt --prod`; the defect originates earlier in local upload selection
- reproducibility: deterministic in production runs `30703999851` and `30708105742`, both failing on the same path after downloading the same 1,149-file deployment set
- trigger conditions: prebuilt deployment with Vercel CLI `58.4.4`, a generated `filePathMap` referencing repository `node_modules`, and the repository's user-provided `.vercelignore` rule `node_modules`

## Confirmed Evidence

- code facts: Vercel CLI `53.1.1` appended every `filePathMap` source path to the upload refs without re-applying user ignore rules; upstream commit `682bf8b47f73936d51cb236391e7fe34b1cade00` added `getUserIgnore()` and skips any `filePathMap` source matched by `.vercelignore`; the commit was authored on 2026-07-30 at 16:34 UTC and shipped in `58.4.4`, published at 20:37 UTC
- repository facts: the successful commit already contained `.vercelignore` rule `node_modules`; the production workflow installs `vercel@latest`; Vercel project `rootDirectory` is `null`
- release facts: the new filter is absent from published `58.4.0` and present in `58.4.4`; upstream explicitly preserved built-in `node_modules` references but re-applied user rules, so this repository's explicit `node_modules` rule is decisive
- runtime evidence: the 2026-05-06 success used CLI `53.1.1`, uploaded 20.7 MB / 4,144 files, included the exact OpenTelemetry source file, had no previous build cache, and completed; the 2026-08-01 failures used CLI `58.4.4`, uploaded 4.4-6.1 MB / 1,149 files, omitted the referenced source, had no previous build cache, and failed with the same `ENOENT`
- diagnostics or logs: the first observed missing file belonged to `@opentelemetry/api`; it is the first unresolved reference encountered, not a causal dependency

## Execution Path

- entry point: `.github/workflows/prod-deploy.yml` installs `vercel@latest`, builds locally, then invokes `vercel deploy --prebuilt --prod`
- critical path: Next/Vercel builder emits function `.vc-config.json` with `filePathMap` source values under `node_modules/.pnpm`; CLI `58.4.4` reads the repository `.vercelignore`; its new security filter drops those source values from upload refs because `node_modules` matches; `.vc-config.json` remains uploaded; the remote builder follows the retained mapping and cannot `lstat` the omitted source
- state transitions: installed dependency exists locally -> function metadata records it -> uploader removes it from deployment files -> remote metadata still references it -> remote materialization fails
- ordering assumptions: allowed runtime `filePathMap` metadata and its source
  files must be selected atomically; CLI `58.4.4` violated that invariant for
  legitimate dependencies matched by the user `node_modules` ignore rule
- hidden branching condition: the new filter reads only user-provided ignore rules. Vercel's built-in `node_modules` ignore remains intentionally bypassed for `filePathMap`, but this repository duplicates `node_modules` in `.vercelignore`, converting it into a user rule
- failure boundary: remote retrieval/materialization of uploaded deployment files before successful deployment creation

## Hypotheses And Failure Points

- confirmed root cause: a Vercel CLI `58.4.4` security change began re-applying user `.vercelignore` rules to generated `filePathMap` source references. The repository's longstanding `node_modules` rule therefore removed legitimate traced dependencies while leaving metadata that still required them
- temporal trigger: `vercel@latest` advanced from `53.1.1` at the last successful deploy to `58.4.4`; the relevant behavior was introduced on 2026-07-30. The first August run failed earlier during application build, and the next run was the first production run to reach prebuilt deploy with the affected CLI
- latent condition: `.vercelignore` had contained `node_modules` since before the last success. It was harmless for prebuilt `filePathMap` refs until Vercel changed their filtering semantics
- failure mechanism: uploader/metadata inconsistency, not a missing local install and not a remote cache miss
- disproven possibilities: cache loss is causal; OpenTelemetry itself is causal; Vercel project root-directory/path-prefix changes are causal; the June 28 failure is the same incident (it was an application `Invalid URL` prerender failure under CLI `54.18.1`)
- non-triggering deltas: Next.js and pnpm upgrades can change the exact trace and upload size, but no evidence makes them necessary to explain the newly enforced ignore behavior

## Missing Evidence / Uncertainty

- what remains unclear: whether Vercel considers user-specified `node_modules` unsupported for prebuilt deployments or whether it will special-case legitimate builder-generated `filePathMap` references in a follow-up release
- confirmed framework limitation: Next.js `16.2.11` Turbopack applies
  `outputFileTracingExcludes` to normal route traces but not to the Node proxy
  trace; the Vercel adapter also intentionally adds production env files to
  Node function metadata. Therefore raw metadata cannot be the final sensitive
  file boundary; the pinned CLI dry-run upload plan is the enforceable boundary.
- what is no longer ambiguous: the local-to-remote causal chain and the reason it began on the first deploy reaching CLI `58.4.4`
- external dependencies or blockers: remediation policy requires Vercel/Implementation review; no further evidence is required to identify this incident's root cause

## Artifact Synchronization

- `plan.md` updates: investigation checklist completed and root-cause classification recorded
- `intake.md` updates: symptom, scope, questions, and Leantime lifecycle recorded
- `implementation-plan.md` updates: not applicable; implementation is prohibited while root cause remains unconfirmed
- specialist artifact updates: this is the single persistent Debug Investigation summary
- Leantime updates: task `98` was moved back to `Do oceny` after implementation, because post-merge production deployment proof is still required
- decision-support artifact: `production-remediation-options.md` records four production-grade remediation models and selects contract-aligned prebuilt deployment as Variant A
- final decision artifact: Variant A is selected; prototype sanitizer/manual
  allowlist/Next tracing-exclude work is archived as non-production.

## Preview Deployment Regression

- confirmed symptom: pull request preview deployment uploaded the repository for
  a remote Vercel build, then failed before `next build` because
  `src/core/db/migrations/generated/meta/_journal.json` was absent
- confirmed trigger: Variant A added the root-level `/src` rule to the shared
  `.vercelignore`; the preview workflow uses `vercel deploy` without
  `--prebuilt`, so it requires application and migration source files in the
  source upload
- confirmed non-cause: changing preview from a global Vercel CLI to the pinned
  repository CLI did not remove the file; the remote log shows source upload
  completed and the missing path is directly covered by `/src`
- execution boundary: production deploy uploads an already-built Build Output
  artifact, while preview uploads source for a remote build; one shared ignore
  profile cannot exclude `/src` for production and simultaneously provide it to
  preview
- minimum safe handoff: preserve the existing preview source-deploy workflow,
  restore a preview-safe default `.vercelignore`, and activate a separate
  production-prebuilt ignore profile only inside the production workflow before
  dry-run and real prebuilt deployment
- required regression check: preview dry-run/source upload must include
  `src/core/db/migrations/generated/meta/_journal.json`; production prebuilt
  dry-run must retain `0` missing allowed references and `0` forbidden uploads
- confirmed remediation: the default `.vercelignore` is preview-safe, the
  production workflow activates `.vercelignore.prebuilt` only after its local
  build, and preview validates a real source dry-run before deployment
- validation evidence: preview dry-run uploaded `626` `src/**` files and the
  migration journal; production dry-run retained `4365` files, `73499700`
  bytes, `0` missing allowed references, and `0` forbidden uploads

## Handoff Notes

- what the next agent should rely on: the exact upstream Vercel commit, immutable package comparison, historical workflow boundary, and deployment-file evidence establish the root cause without relying on correlation alone
- what remains unproven: Vercel's intended long-term compatibility contract for explicit user `node_modules` ignore rules in prebuilt projects
- recommended next specialist or step: run controlled production deployment
  proof after the local Variant A implementation: fresh `vercel build --prod`,
  artifact contract guard, dry-run upload coverage guard, real prebuilt deploy,
  and deployment status inspection.

## Update Log

### 2026-08-01 - Investigation Opened

- Trigger: Production prebuilt deployment failed with a missing pnpm dependency path.
- Summary of change: Created independent task artifacts, normalized claims as hypotheses, and opened Leantime tracking.
- Sections refreshed: all initial sections

### 2026-08-01 - Root Cause Confirmed

- Trigger: Compared the actual `@vercel/client` prebuilt uploader implementation across the successful and failing CLI releases.
- Summary of change: Confirmed that Vercel's July 30 security patch, first present in CLI `58.4.4`, re-applies this repository's `node_modules` user-ignore rule to `filePathMap` refs and creates the observed incomplete upload.
- Sections refreshed: scope, inputs, actions, symptom, evidence, execution path, hypotheses, uncertainty, synchronization, and handoff

### 2026-08-01 - Production Options Documented

- Trigger: Requested production-only remediation alternatives and a recommendation suitable for the boilerplate.
- Summary of change: Added `production-remediation-options.md`; recommended retaining prebuilt deployment while aligning ignore rules with Vercel's contract, pinning the CLI, validating `filePathMap` source values, and rejecting rather than mutating unsafe artifacts.
- Remaining authority boundary: Architecture Guard, Security & Auth, and Validation Strategy must approve the production design before implementation.

### 2026-08-01 - Variant A Accepted And Prototype Archived

- Trigger: User requested artifact synchronization after accepting Variant A.
- Summary of change: Marked Variant A as the accepted production direction,
  documented that New Relic remains, and classified the earlier sanitizer,
  manual package allowlist, and `next.config.ts` tracing-exclude workaround as
  archived prototype work.
- Sections refreshed: task context, artifact synchronization, handoff notes

### 2026-08-01 - Variant A Implemented Locally

- Trigger: User requested starting the accepted remediation.
- Summary of change: Implemented pinned CLI usage, simplified `.vercelignore`,
  source-value artifact validation, fail-closed forbidden/symlink/upload guards,
  production workflow guard wiring, and dry-run upload metric reporting.
- Residual proof: fresh production build and real deploy remain pending because
  the configured Vercel build command runs production migrations.

### 2026-08-01 - Local Task Closed, Leantime Left Open For Verification

- Trigger: User requested PR text, final solution documentation, `.copilot`
  closure, and Leantime kept open for post-merge verification.
- Summary of change: Closed the local implementation artifacts and moved
  Leantime task `98` to `Do oceny` until the production workflow proves the
  real deploy path after merge.

### 2026-08-01 - Fresh Artifact Contract Corrected

- Trigger: A clean unsanitized build produced forbidden metadata references
  despite supported route-level tracing exclusions.
- Summary of change: Confirmed the Turbopack Node proxy tracing limitation and
  Vercel adapter env-file behavior. Corrected the guard boundary to require all
  allowed runtime refs, reject forbidden uploads, and enforce `5000` file / `80
MiB` budgets. Fresh dry-run evidence: `11292` trace refs, `266` forbidden
  metadata refs excluded from upload, `4365` uploaded files, `73499700` bytes,
  `0` missing allowed refs, and `0` forbidden uploads.

### 2026-08-01 - Preview Source Upload Regression Confirmed

- Trigger: PR preview deployment failed while opening the migration journal.
- Summary of change: Confirmed that the shared `/src` `.vercelignore` rule,
  introduced for production prebuilt upload policy, removed source required by
  the unchanged remote preview build. The pinned CLI change is not the direct
  cause.
- Required handoff: split preview source-upload and production prebuilt ignore
  profiles without converting or otherwise redesigning preview deployment.

### 2026-08-01 - Preview And Prebuilt Profiles Split

- Trigger: User requested restoring normal preview deployment while preserving
  the production prebuilt guard.
- Summary of change: Restored a source-safe default `.vercelignore`, added a
  production-only `.vercelignore.prebuilt`, activated it after production
  build, and added preview source dry-run validation before the real deploy.
- Evidence: Real preview and production CLI dry-runs passed their respective
  lifecycle contracts; hosted preview and real production deploys remain the
  final external workflow proofs.

### 2026-08-13 - Release Review And Preview Scope Confirmed

- Trigger: User requested verification that a newer Vercel CLI release resolves
  the incident and removal of any preview-only prebuilt workaround.
- Release evidence: `vercel@58.4.4` release metadata records only a republish.
  npm reports `58.11.0`, but GitHub exposes no matching release entry; neither
  source establishes an upstream fix for the observed prebuilt upload behavior.
- Superseded decision: at user direction, remove the fixed CLI dependency and
  resolve `vercel@latest` through `pnpm dlx` for every deploy command. Remove
  the unrelated preview URL-output parsing change from the live workflow and
  historical SDD.
- Boundary retained: preview remains a source upload with its source-completeness
  regression guard; production alone activates the prebuilt ignore profile and
  prebuilt artifact/upload guards.
