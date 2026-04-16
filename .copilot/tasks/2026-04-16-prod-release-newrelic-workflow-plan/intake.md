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
- The original release-published New Relic workflow was unsafe when release and deployment were independent.
- After release was chained behind successful production deployment, release publication became a valid downstream signal for a final New Relic workflow.
- A dedicated final New Relic workflow restores retryability if the marker step fails after release publication.

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

1. Are manual GitHub releases outside the release workflow operationally disallowed, or is that drift risk accepted?
2. Should the New Relic event continue to normalize tag names like `v1.2.3` to `1.2.3`, or should the raw tag be preserved?
3. Is any extra governance needed to guarantee that published releases always originate from the ordered deploy -> release path?

## Initial Recommendation Direction

Prefer treating successful production deployment as the upstream truth gate, then triggering release after that gate, then emitting the final New Relic deployment event from a dedicated published-release workflow for retryability and readable semver metadata.

## Specialist-backed status

- Architecture Guard summary recorded in `01 - Architecture Guard - Summary.md`
- Validation Strategy summary recorded in `05 - Validation Strategy - Summary.md`
- Implementation summary recorded in `04 - Implementation Agent - Summary.md`
- Current recommended implementation default: keep three explicit stages: deploy, release, and final New Relic change tracking
