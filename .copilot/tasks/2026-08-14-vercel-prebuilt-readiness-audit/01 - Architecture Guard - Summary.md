# 01 - Architecture Guard - Summary

## Task Context

- Task ID: `2026-08-14-vercel-prebuilt-readiness-audit`
- Task Objective: Independently assess whether the production Vercel prebuilt deployment path is architecturally ready after recurring `ENOENT` failures.
- Current Run Scope: Read-only review of deployment ownership, configuration source of truth, regression guards, documentation drift, and change blast radius.
- Status: COMPLETED WITH GO/NO-GO CONDITIONS
- Last Updated: 2026-08-14
- Related Control Artifacts: `plan.md`, `intake.md`

## Scope Handled

- modules / layers reviewed: GitHub Actions delivery orchestration, Vercel project configuration boundary, deployment validation scripts, upload profiles, operational documentation, and prior incident artifacts.
- change surface reviewed: `.github/workflows/prod-deploy.yml`, `.github/workflows/preview-deploy.yml`, `.vercelignore`, `.vercelignore.prebuilt`, `scripts/validate-vercel-prebuilt-artifact.ts`, `scripts/validate-vercel-deploy-profiles.ts`, `scripts/vercel/cli.ts`, their focused tests, package scripts, deployment docs, and current Git diff.
- architecture questions in scope: ownership of migrations/builds, authoritative configuration boundaries, regression-guard placement, documentation alignment, and production blast radius.

## Inputs Reviewed

- code paths reviewed: production and preview deployment workflows; prebuilt artifact and upload-plan validators; deployment profile validator; Vercel CLI wrapper; focused tests; package scripts.
- docs / ADRs / prompts reviewed: `docs/features/19 - CI-CD & Lighthouse CI.md`, `docs/features/DEPLOY-manual.md`, `docs/features/DEPLOY-neon.md`, and the versioned deployment examples under `docs/sdd/`.
- earlier task artifacts reviewed: the 2026-08-01 root-cause and node-modules deployment records, the 2026-08-12 trace investigation, and the 2026-08-13 environment-template investigation.

## Actions Performed

- repository inspection performed: compared live workflow behavior with the current diff and prior fresh production dry-run evidence.
- boundary checks performed: separated GitHub Actions orchestration, Vercel CLI build/upload behavior, generated Build Output contract validation, and Vercel Project Build Command ownership.
- dependency / DI review performed: not applicable to this delivery/tooling-only change; no application module, domain contract, or DI composition boundary is changed.
- docs-vs-code checks performed: compared all named deployment docs and SDD samples against the live preview and production workflows.

## Current-State Findings

### MAJOR

- The selected production migration owner is an external Vercel Project Build Command, but the repository cannot prove that this project setting is currently `pnpm db:migrate:prod && pnpm build`. `scripts/validate-vercel-deploy-profiles.ts` proves only that GitHub Actions invokes `vercel build --prod` and does not separately invoke `pnpm db:migrate:prod`; its ownership assertion is exercised only by `scripts/validate-vercel-deploy-profiles.test.ts`, not invoked in the production workflow. This is the correct repository-side separation of responsibility, but it leaves the sole migration owner as an unverified external configuration dependency.
- `docs/features/DEPLOY-manual.md` is internally inconsistent with live code. Its Vercel setup section correctly states that the shared Vercel Project Build Command owns the production migration, while its later automatic-deployment section still says production uses an explicit GitHub Actions migration before prebuilt deployment. Following the latter would reintroduce duplicate DDL ownership forbidden by the live workflow policy.
- `docs/sdd/deployVercelPreview.yml` remains a stale executable-looking sample: it uses Node 22, pushes `develop`, performs `vercel build`, and deploys `--prebuilt`. The live preview workflow intentionally uses a normal remote Vercel preview build with PR Git metadata so Neon can inject deployment-scoped branch configuration. Copying the SDD sample can bypass that runtime ownership model and migrate/build against the wrong preview target.

### MINOR

- The Vercel CLI wrapper centralizes local diagnostic commands only; production and preview workflows independently invoke `npm exec --yes vercel@latest --`. The shared resolver policy is consistent, and focused wrapper tests cover the local helper, but workflow invocation syntax remains duplicated across the delivery layer. This is acceptable at the current blast radius because the validators exercise current CLI output rather than trusting a pinned implementation.
- The current diff changes both active workflows, validators, profile policy, helper invocation behavior, tests, task artifacts, and deployment docs. The related source change is intentionally limited to deployment tooling; no `src/**` application behavior, server/client boundary, or public API contract is altered.

### INFORMATIONAL

- The previous `ENOENT` root cause is addressed at the correct ownership boundary: generated Vercel `filePathMap` source values define the required prebuilt upload closure. The production prebuilt profile no longer globally excludes `src/**`, while the validator requires every non-forbidden traced source to appear in the Vercel dry-run upload plan.
- The validators fail closed for missing sources, real-path escapes, symlink escapes, malformed metadata, forbidden uploads, missing allowed uploads, and file-count/size budgets. Focused tests specifically cover traced `src/**`, `.next`, `node_modules`, public template exceptions, and historical forbidden-path behavior.
- Prior authenticated clean-worktree evidence on 2026-08-12 established a fresh production build and dry-run upload plan with no `logs/server.log` trace, 23 required `src/**` paths, zero missing allowed uploads, zero forbidden uploads, and both upload budgets satisfied. This is strong local contract evidence, not hosted-production deployment proof.

## Boundary And Dependency Assessment

- module ownership assessment: GitHub Actions owns checkout, environment pull, static environment validation, invoking `vercel build --prod`, validating generated output, selecting the prebuilt upload profile, and executing the deploy. Vercel owns the project Build Command execution during `vercel build --prod`; that command is the sole intended production migration owner. The Vercel-generated `.vc-config.json` remains treated as output, not edited by repository code.
- dependency direction assessment: the change stays within CI/tooling and documentation. Application-layer dependency direction remains unaffected. The prebuilt validator depends on generated Vercel output and safe filesystem utilities, which is appropriate for a deployment-contract checker.
- DI / composition assessment: no DI container or request-sensitive composition path is affected.
- cross-module coupling assessment: coupling is restricted to the intended external deployment contract: Vercel CLI output feeds the validators; the Vercel Project Build Command supplies migration/build ownership. The remaining risk is not code coupling but unversioned external project configuration.

## Architectural Decisions / Constraints

- approved architectural constraints:
  - Keep preview as a remote Vercel source build with Git metadata verification; do not introduce preview prebuilt deployment while Neon preview branching is enabled.
  - Keep production as GitHub Actions-orchestrated `vercel build --prod` followed by `vercel deploy --prebuilt --prod`.
  - Keep production migration execution in exactly one place: the shared Vercel Project Build Command. GitHub Actions must not add a separate migration command.
  - Treat every non-forbidden generated `filePathMap` source as mandatory upload input; do not restore `/src` exclusion, per-file ignore exceptions, or generated output mutation.
  - Preserve the Production-scoped runtime environment contract. The AuthJS check correctly rejects a missing `NEXTAUTH_URL` rather than synthesizing a build-only fallback.
- rejected directions:
  - Do not return to a workflow-owned production migration step.
  - Do not use the SDD prebuilt preview example as an operational workflow.
  - Do not encode Vercel generated-output assumptions by deleting entries from `.vc-config.json` or with package/source allowlists.
- follow-up architectural guardrails:
  - Treat the Vercel Project Build Command as a deployment configuration source of truth and verify its value in the configured project before promotion.
  - Make deployment documentation describe only the live ownership model, especially where documents are executable-looking YAML samples.

## Artifact Synchronization

- `plan.md` updates: not edited; user requested exactly one specialist artifact.
- `intake.md` updates: not edited; user requested exactly one specialist artifact.
- `implementation-plan.md` updates: not present for this task.
- specialist artifact updates: created this single Architecture Guard summary.

## Open Questions / Blockers

- unresolved questions: whether the target Vercel Production project currently has the required shared Build Command configured. Repository files cannot answer this because no `vercel.json` exists and the setting is external.
- blockers:
  - Block unconditional GO until the Vercel Production project setting is verified to be exactly the documented single-owner Build Command and the stale documentation is corrected or explicitly marked non-operational.
  - Block a claim that production is deployed/ready until the hosted production workflow completes its fresh build, artifact guard, prebuilt dry-run guard, real deploy, and ready-state checks.
- evidence still needed:
  - Vercel project settings evidence for the Production Build Command.
  - A hosted production workflow run from the reviewed branch, including deploy completion and ready status.

## Handoff Notes

- what the next agent should rely on: the production prebuilt closure design is architecturally sound and directly addresses the historical trace/upload mismatch. The current workflow avoids build-only AuthJS environment masking and correctly separates preview and production ownership models.
- what should not be re-decided without new evidence: the Vercel-generated Build Output is authoritative for traced-source closure; `src/**` may be required by generated output and cannot be globally forbidden. The Vercel Project Build Command, not GitHub Actions, is the intended single migration owner.
- recommended next specialist or step: obtain external Vercel project-setting evidence, correct or retire the stale manual/SDD deployment guidance, then let Validation Strategy assess the hosted workflow evidence against the audit acceptance standard.

## Update Log

### Update Entry

- Date: 2026-08-14
- Trigger: Implementation follow-up resolved the review's configuration and documentation conditions.
- Summary of change: Read-only live Vercel settings verification confirmed the external single-owner Build Command. Documentation was corrected, the stale Preview example became valid non-operational YAML metadata, and the production workflow now verifies the hosted prebuilt deployment reaches READY.
- Sections refreshed: current-state findings, blockers, and handoff conditions.

### Update Entry

- Date: 2026-08-14
- Trigger: Independent read-only Architecture Guard review requested for the Vercel prebuilt readiness audit.
- Summary of change: Reviewed live delivery paths, validators, profiles, helper, focused tests, historical incident evidence, deployment documentation, and current diff. Recorded two major configuration/documentation conditions and a conditional GO recommendation.
- Sections refreshed: all
