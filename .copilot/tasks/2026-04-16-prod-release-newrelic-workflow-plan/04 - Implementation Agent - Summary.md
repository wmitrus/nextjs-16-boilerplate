# 04 - Implementation Agent - Summary

## Scope handled

Implemented the final ordered workflow model: production deploy first, release second, and New Relic change tracking last using semantic version metadata.

## Actions performed

- Removed the New Relic deployment event step from `.github/workflows/prod-deploy.yml`
- Removed `.github/workflows/new-relic-change-tracking.yml`
- Changed `.github/workflows/release.yml` to run via `workflow_run` only after successful `Production Deployment`
- Added the New Relic deployment event step to `.github/workflows/release.yml`, gated on semantic-release publishing a version
- Updated `docs/features/19 - CI-CD & Lighthouse CI.md` to reflect the new deployment-marker ownership model
- Synchronized the task control artifacts to record implementation and validation evidence

## Files changed

- `.github/workflows/prod-deploy.yml`
- `.github/workflows/new-relic-change-tracking.yml` (deleted)
- `.github/workflows/release.yml`
- `docs/features/19 - CI-CD & Lighthouse CI.md`
- `.copilot/tasks/2026-04-16-prod-release-newrelic-workflow-plan/plan.md`
- `.copilot/tasks/2026-04-16-prod-release-newrelic-workflow-plan/implementation-plan.md`

## Decisions made

- Production deployment truth remains owned by `prod-deploy.yml`
- Release publication is no longer used as a proxy for production deployment
- Release now runs only after successful production deployment while remaining in a separate workflow file
- New Relic now runs last, from the release workflow, after deploy success is already proven
- Semantic-release version is now used as the visible New Relic `version`
- The deployed commit SHA from `github.event.workflow_run.head_sha` is used as the New Relic `commit`
- New Relic uses `changeTrackingCreateEvent` mode in the release workflow

## Validation notes

- The New Relic step now sits after the semantic-release step and runs only when `RELEASED=1` and `NEW_VERSION` are present
- Docs-only and markdown-only pushes no longer emit a production marker because they do not trigger production deployment and therefore do not trigger release
- The release workflow now checks out `github.event.workflow_run.head_sha`, so semantic-release runs against the deployed commit rather than an unrelated later branch head
- Rerunning a successful production deployment workflow will trigger the release workflow again, but the New Relic step should only fire if semantic-release publishes a new version in that rerun

## Residual risks

- The New Relic action reference is still tag-based, not SHA-pinned
- Duplicate deployment events remain possible only if a rerun somehow results in another semantic release publication
- GitHub UI ruleset configuration was not verifiable from this session

## Handoff notes

This implementation now matches the stricter semver-based marker requirement without needing cross-workflow artifact handoff because semantic-release already exposes `NEW_VERSION` inside the release job.
