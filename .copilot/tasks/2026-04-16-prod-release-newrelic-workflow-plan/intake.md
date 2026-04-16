# Intake

## Objective

Produce a professional, production-grade plan for New Relic deployment/change tracking workflow design in this repository, with deep analysis of:

- which workflow is the real production deploy path
- how `release.yml` behaves relative to `prod-deploy.yml`
- whether release success implies deploy success
- what protections currently exist
- what best-practice workflow structure should be used for a production deployment marker

## User Request Summary

The user asked for a professional plan first, saved into a new task artifact workspace, with deep analysis of what runs in production and what is exactly needed in the workflow for best-practice professional production deployment behavior.

## Scope

In scope:

- Current GitHub Actions workflow topology analysis
- Release vs production deploy execution semantics
- New Relic marker placement analysis
- Production-grade workflow orchestration recommendations
- Artifact-backed planning and constraints

Out of scope for this phase:

- Direct workflow edits
- Secret rotation or environment-variable changes
- Changes to Vercel project configuration
- New Relic UI changes
- Broad CI/CD redesign beyond the deployment-marker and release/deploy coupling question

## Acceptance Criteria

- [x] New task workspace created under `.copilot/tasks/`
- [x] `plan.md` created first
- [x] `intake.md` created second
- [x] Current production deployment truth source explicitly identified
- [x] Release workflow independence explicitly documented
- [x] Existing protections identified as code-backed vs documentation-only
- [x] Professional workflow recommendation documented with tradeoffs
- [x] Binding constraints artifact created
- [x] Execution-ready implementation plan drafted

## Referenced Repository Evidence

Primary workflow files:

- `.github/workflows/prod-deploy.yml`
- `.github/workflows/release.yml`
- `.github/workflows/new-relic-change-tracking.yml`
- `.github/workflows/pr-validation.yml`
- `.releaserc.json`

Supporting docs:

- `docs/features/10 - Release Automation.md`
- `docs/features/19 - CI-CD & Lighthouse CI.md`
- `docs/sdd/03.1 - GitHub Rulesets.md`
- `docs/features/DEPLOY-manual.md`
- `docs/features/26 - New Relic Server & Browser Integration.md`
- `docs/ai/general/COPILOT_TASK_ARTIFACTS.md`
- `docs/ai/general/LEANTIME_AUTOMATION.md`

## Normalized Findings So Far

- The repository's real production deployment happens in `prod-deploy.yml` through the Vercel production deploy flow.
- `release.yml` is a separate semantic-release workflow triggered by the same `push` event, not a downstream step of successful production deployment.
- The current New Relic workflow is bound to GitHub release publication, not successful production deployment.
- The current design can therefore publish a deployment/change marker that does not strictly prove a successful production rollout.
- If semantic version is required for the marker, a deploy-driven workflow must solve version availability explicitly.

## Readiness Checklist

- [x] Workflow inventory read
- [x] Release config read
- [x] Repository New Relic guidance read
- [x] Artifact system guidance read
- [ ] Leantime task opened
      Blocked in this session because no command-execution tool is available to run `pnpm lt` operations.
- [x] Constraints normalized
- [x] Specialist delegation decision recorded
- [x] Implementation recommendation stabilized

## Open Questions

1. Must the deployment marker show semantic-release version, or is deployed commit SHA acceptable?
2. Should the marker represent GitHub release publication, successful production deployment, or both as separate signals?
3. Does the repository owner want a minimal fix to New Relic marker placement or a stronger release/deploy coupling model?

## Initial Recommendation Direction

Prefer treating successful production deployment as the source of truth for deployment/change markers. Treat semantic-release publication as a separate release-management concern unless the repository is intentionally redesigned so release creation happens only after confirmed production deployment success.

## Specialist-backed status

- Architecture Guard summary recorded in `01 - Architecture Guard - Summary.md`
- Validation Strategy summary recorded in `05 - Validation Strategy - Summary.md`
- Implementation summary recorded in `04 - Implementation Agent - Summary.md`
- Current recommended implementation default: attach the production marker to the successful production deploy path unless a stricter semantic-version coupling requirement is later confirmed
