# Plan

## Objective

Determine the production-safe workflow design for New Relic change tracking in this repository, with explicit analysis of which workflows represent real production deployment, how `release.yml` and `prod-deploy.yml` interact, what protections actually exist, and what a professional production-grade workflow should require before emitting a deployment marker.

## Current Status

- [x] Task workspace created
- [x] Initial orchestration analysis started
- [x] Core workflow files inspected
- [ ] Leantime task opened and linked
      Blocked: this session does not expose command execution, so `pnpm lt` operations cannot be run from the available toolset.
- [x] Intake normalized from user request and repository evidence
- [x] Constraints consolidated into a binding artifact
- [x] Implementation-plan artifact drafted
- [x] Specialist delegation decision finalized
- [x] Production-safe recommendation written
- [x] Optional implementation handoff prepared
- [x] Workflow implementation applied
- [x] Focused validation evidence recorded

## Task Classification

- Type: workflow architecture and deployment-governance analysis
- Risk level: medium
- Runtime sensitivity: high
- Deployment sensitivity: high
- Auth sensitivity: low
- Primary concern: CI/CD correctness, production deploy truth source, release/deploy coupling, New Relic marker placement

## Likely Affected Areas

- `.github/workflows/prod-deploy.yml`
- `.github/workflows/release.yml`
- `.github/workflows/new-relic-change-tracking.yml`
- `.releaserc.json`
- `docs/features/10 - Release Automation.md`
- `docs/features/19 - CI-CD & Lighthouse CI.md`
- `docs/sdd/03.1 - GitHub Rulesets.md`
- `docs/features/26 - New Relic Server & Browser Integration.md`

## Known Facts

- `prod-deploy.yml` is the repository's production deployment workflow and performs the actual Vercel production deployment.
- `release.yml` is now a separate workflow triggered by successful completion of `Production Deployment` on `main`.
- `new-relic-change-tracking.yml` has been removed.
- Release and production deployment remain in separate files, and New Relic now runs last from the release workflow.
- `prod-deploy.yml` ignores docs-only and markdown-only changes, and release no longer runs for those changes because it is downstream of `Production Deployment`.
- Repository docs indicate protection is intended to come from PR validation and rulesets, not from runtime coupling between release and deployment workflows.

## Risks / Unknowns

- Unknown whether GitHub rulesets are currently enabled in the repository UI or only documented.
- Unknown whether the desired deployment marker must use semantic-release version, commit SHA, or another version source.
- If semantic-release version is required, independent workflows create a race/availability problem for a deploy-triggered marker.
- If the marker is attached to release publication, it can drift from real production deployment truth.

## Planned Specialist Sequence

1. Workflow Orchestrator: create artifacts, normalize scope, consolidate current evidence.
2. Leantime Integration: mirror the task lifecycle in Leantime.
3. Architecture Guard: review the workflow topology and identify the correct source of truth for deployment markers.
4. Validation Strategy: determine minimum safe validation for any future workflow changes.
5. Workflow Orchestrator: consolidate constraints and produce an implementation-ready recommendation.
6. Implementation Agent: deferred unless the user requests code changes.

## Artifacts For This Task

- `plan.md`
- `intake.md`
- `constraints.md`
- `implementation-plan.md`
- `01 - Architecture Guard - Summary.md`
- `05 - Validation Strategy - Summary.md`
- `04 - Implementation Agent - Summary.md`
- `validation-report.md`

## Progress Notes

- Initial repository evidence already confirms the current production source of truth is `prod-deploy.yml`, while release publication is a separate event path.
- Architecture Guard confirmed the release/deploy split is structurally acceptable, but the current New Relic marker attachment to `release.published` is architecturally drift-prone.
- Validation Strategy confirmed this should stay a narrow workflow-semantics validation problem, not a broad test-expansion task.
- The implementation plan now contains an execution-ready default proposal: move the marker to the successful end of `prod-deploy.yml` and use `github.sha` as the canonical deployment identity.
- Option A has now been implemented: the marker lives on the production deploy success path, and the release-triggered production marker workflow has been removed.
- The stronger workflow ordering model has now been finalized: release runs only after successful production deployment, and New Relic runs last from the release workflow using semantic version metadata.
- Repository docs now reflect the new ownership model across CI/CD, observability, release, and deployment documentation.
- The user explicitly declined follow-up work to pin the New Relic action to a verified full SHA in this task.
- The semantic decision has been resolved: the New Relic event now represents successful ordered completion of deployment and release publication.
- The remaining orchestration blocker is the Leantime open step, which cannot be completed in this session without command execution support.
