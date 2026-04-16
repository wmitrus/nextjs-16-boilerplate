# 04 - Implementation Agent - Summary

## Scope handled

Implemented the corrected final ordered workflow model: production deploy first, release second, and a separate retryable New Relic workflow last using semantic version metadata.

## Actions performed

- Removed the New Relic deployment event step from `.github/workflows/prod-deploy.yml`
- Changed `.github/workflows/release.yml` to run via `workflow_run` only after successful `Production Deployment`
- Removed the inline New Relic deployment event step from `.github/workflows/release.yml`
- Added `.github/workflows/new-relic-change-tracking.yml` back as a dedicated final workflow triggered by published releases
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
- New Relic now runs last, from its own workflow, after deploy success and release publication are already proven
- Semantic-release version is now used as the visible New Relic `version`
- The tagged commit resolved from the published release is used as the New Relic `commit`
- New Relic uses `changeTrackingCreateEvent` mode in the dedicated final workflow

## Validation notes

- The New Relic workflow now runs from `release.published`, so it can be rerun independently if only the marker step fails
- Docs-only and markdown-only pushes no longer emit a production marker because they do not trigger production deployment and therefore do not trigger release
- The release workflow now checks out `github.event.workflow_run.head_sha`, so semantic-release runs against the deployed commit rather than an unrelated later branch head
- Rerunning the dedicated New Relic workflow preserves the release payload, semantic version, and tagged commit without requiring semantic-release to publish again

## Residual risks

- The New Relic action reference is still tag-based, not SHA-pinned
- Manual GitHub release publication outside the ordered release workflow would still trigger the final New Relic workflow unless governance prevents it
- GitHub UI ruleset configuration was not verifiable from this session

## Handoff notes

This implementation now matches the stricter semver-based marker requirement while restoring retryability by keeping New Relic in its own final workflow.
