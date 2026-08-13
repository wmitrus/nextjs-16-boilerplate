# Plan

## Task Metadata

- Task ID: `2026-08-01-vercel-prebuilt-deploy-root-cause`
- Objective: Establish the evidence-backed root cause of the Vercel production prebuilt deployment failure that surfaced as `ENOENT` for a traced pnpm dependency.
- Active specialist: `06 - Debug Investigation`
- Leantime milestone: `97` (`Vercel prebuilt deployment incident`).
- Leantime task: `98` (`Determine Vercel prebuilt deploy root cause`), status `Do oceny` (`2`).
- Status: Implementation and local validation complete, including split preview/prebuilt upload profiles; awaiting workflow preview and post-merge production deploy verification in Leantime.

## Investigation Plan

- [done] Normalize the symptom, timeline, and claims that require proof.
- [done] Open or locate the Leantime task and record its ID.
- [done] Identify the last successful and first failing production deployment evidence.
- [done] Trace the local CI path from dependency installation through `vercel build --prod` to `vercel deploy --prebuilt --prod`.
- [done] Compare version and configuration changes across the failure boundary.
- [done] Inspect generated Build Output API metadata and uploaded file selection.
- [done] Run controlled discriminating checks for ignore rules, tracing behavior, CLI behavior, and cache relevance.
- [done] Classify the causal chain into trigger, latent defect, failure mechanism, and incidental first missing file.
- [done] Update the Debug Investigation summary with confirmed facts, falsified hypotheses, uncertainty, and next specialist handoff.
- [done] Select the production remediation direction.
- [done] Mark prototype remediation as archived/non-production.
- [done] Synchronize task artifacts and close the investigation lifecycle.
- [done] Close local `.copilot` implementation artifacts with production verification pending.
- [done] Reopen Leantime task `98` to `Do oceny` until post-merge production deploy proof is collected.
- [done] Confirm the preview source-deploy regression caused by sharing the
  production `/src` exclusion with preview.
- [done] Restore a preview-safe default `.vercelignore` and add a dedicated
  `.vercelignore.prebuilt` profile activated only by the production workflow.
- [done] Add preview source dry-run validation for required build and migration
  inputs before the real deployment.
- [done] Revalidate both real CLI plans: preview required sources present;
  production `0` missing allowed refs and `0` forbidden uploads.
- [done] Confirm release metadata and scope: `vercel@58.4.4` release notes only
  record a republish, while direct package/history evidence remains the root-cause
  proof; no preview prebuilt workaround is required.
- [done] Address verified PR review findings: keep production env validation
  enabled and fail closed for malformed Vercel dry-run output.
- [done] Restore the two E2E helper files required by `playwright.config.ts` in
  preview source uploads and enforce their presence in the preview dry-run
  guard.

## Confirmed Causal Chain

1. The repository has a longstanding user `.vercelignore` rule for `node_modules`.
2. Builders legitimately emit function `filePathMap` entries pointing to traced pnpm files under repository `node_modules`.
3. Vercel CLI through `58.4.0` appended these references after ignore processing, so the last successful deployment uploaded them.
4. Upstream security commit `682bf8b47f73936d51cb236391e7fe34b1cade00`, shipped in `58.4.4`, began re-applying user ignore rules to those references.
5. The workflow's unpinned `vercel@latest` selected `58.4.4`; it omitted the referenced dependencies but uploaded metadata that still required them.
6. Remote materialization followed the metadata and failed deterministically with `ENOENT` on the first unresolved OpenTelemetry path.

## Accepted Remediation Plan - Variant A

This task accepts Variant A from `production-remediation-options.md` as the
production plan.

- [done] Remove prototype-only `.vercelignore` package allowlist rules and do not keep
  manual dependency exceptions such as `next`, `react`, `newrelic`, `pino`, or
  broad `.pnpm` exceptions as the final solution.
- [done] Add supported route-level `outputFileTracingExcludes` for non-runtime
  repository paths; verify separately that Next 16.2.11 Turbopack does not apply
  them to the Node proxy trace.
- [done] Remove the sanitizer path that mutates generated `.vc-config.json`.
- [done] Resolve `vercel@latest` through `pnpm dlx` for each deploy command and
  rely on artifact/upload-plan guards as the CLI compatibility boundary.
- [done] Split upload profiles: keep default `.vercelignore` source-safe for
  preview, and keep `.vercelignore.prebuilt` free of `.next`/`node_modules`
  exclusions while blocking root env/log/source/test/report artifacts.
- [done] Rewrite the validator to operate on `Object.values(filePathMap)`, because
  those values are the source paths Vercel uploads.
- [done] Add containment and symlink-escape checks for each required source path.
- [done] Fail closed if source paths are missing, outside the repository root, or
  symlink-escaping; require every allowed runtime source in the dry-run upload and
  reject every forbidden source present in that upload.
- [done] Record a baseline upload file count and byte size; require review when a
  future PR exceeds the accepted budget.
- [done] Wire the guards into production deploy before the real `vercel deploy
--prebuilt --prod`.
- [deferred] Run a deployment proof after merge, because production deploy can
  only be proven through the updated production workflow.

Fresh clean build baseline captured with pinned Vercel CLI `58.4.4`: `11292`
traced source references, `266` forbidden metadata references, `4365` uploaded
files, `73499700` bytes, `0` missing allowed references, and `0` forbidden
uploads. Enforced budgets are `5000` files and `83886080` bytes.

The fresh local build used a temporary Vercel config that skipped production
migrations. Real production deployment proof remains pending because production
migrations and deploy authority belong to the protected workflow.

The local task is closed as implementation-complete. Leantime remains open in
`Do oceny` until the merged production workflow proves the fresh build and real
deploy path.

## 2026-08-13 Scope Clarification

- The incident remains isolated to production `vercel deploy --prebuilt --prod`.
  Preview uploads source for a remote build and was never affected by the
  `filePathMap`/`node_modules` omission.
- The temporary preview URL-output parsing change proposed after a CodeRabbit
  comment was removed from both the live workflow and the historical preview
  SDD. It is unrelated to the proven prebuilt incident.
- Retained preview validation is not a CLI workaround: it prevents recurrence of
  the separate, observed `/src` upload regression introduced when production and
  preview briefly shared a production-only ignore profile.
- Deploy commands resolve `vercel@latest` through `pnpm dlx`; production guards
  remain mandatory regardless of the CLI version that CI resolves.
- npm dist-tag `latest` was `58.11.0` on 2026-08-13. The local `pnpm dlx` cache
  ran `58.9.5`; the fresh GitHub Actions runner is the authoritative resolution
  environment for the next deploy.
- The old local `.vercel/output` is invalid after removing the prior CLI package
  because it references stale `ms@2.1.1` files. Fresh production artifact proof
  remains a protected-workflow responsibility due to production migrations.

## Archived Prototype Decision

The earlier phase-based work in
`.copilot/tasks/2026-08-01-vercel-prebuilt-node-modules-deploy/` is useful
forensics but not the production plan.

- [done] Keep historical investigation notes.
- [done] Keep regression-test ideas and dry-run parser lessons for reuse.
- [done] Archive sanitizer behavior as rejected for production.
- [done] Archive manual dependency allowlisting as rejected for production.
- [done] Reject broad `outputFileTracingExcludes` as the incident fix; retain
  supported route-level exclusions as metadata-size and data-minimization
  hygiene, with the Node proxy limitation documented.

## New Relic Decision

- [done] New Relic remains in the repository.
- [done] OpenTelemetry/New Relic traces are not the incident root cause.
- [done] `NODE_OPTIONS` New Relic preload should remain blocked for Vercel deploy
  contexts.
- [done] Removing New Relic is explicitly not part of Variant A.

## Initial Hypotheses

These are unproven until a controlled check or historical comparison supports them:

1. A toolchain change altered Build Output tracing or prebuilt upload behavior.
2. An application dependency/import change introduced external pnpm paths into function metadata.
3. An ignore rule excludes files referenced by generated function metadata.
4. A previous Vercel build cache masked an already-incomplete artifact.
5. The failure is caused by a transient or regressed Vercel CLI/server implementation independent of repository changes.

## Evidence Standard

A root-cause conclusion must explain both:

- why the deployment artifact was internally inconsistent; and
- why that inconsistency first became observable at this deployment boundary.

The investigation will not equate the first missing OpenTelemetry file, a local existence check, or a correlated ignore rule with the root cause without a discriminating comparison.
