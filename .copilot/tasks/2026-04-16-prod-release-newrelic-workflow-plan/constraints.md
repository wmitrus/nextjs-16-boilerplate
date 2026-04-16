# Constraints

## Binding objective

Any future change for New Relic deployment/change tracking in this repository must treat successful production deployment as the upstream source of truth for a production deployment marker.

## Binding workflow constraints

- `prod-deploy.yml` is the authoritative production deployment workflow.
- `release.yml` is a release-management workflow, not production deployment authority.
- `release.published` must not be treated as proof of production deployment success unless release publication is already downstream of successful production deployment.
- A production deployment marker must only be emitted from:
  - the successful path inside `prod-deploy.yml`, or
  - a downstream workflow triggered by successful completion of `prod-deploy.yml`, or
  - a final `release.published` workflow when that release is already produced downstream of successful production deployment
- If release publication is retained as a signal, it must be treated as a separate event class from production deployment.

## Binding version constraints

- Marker identity must be explicitly defined before implementation: semantic version, commit SHA, or both.
- If semantic version is required, the implementation must prove that the version is available on the final marker path without race conditions or ambiguity.
- Do not assume semantic-release output is naturally available to deploy-triggered workflows; prefer published release metadata or explicit handoff.

## Allowed change surface

- `.github/workflows/prod-deploy.yml`
- `.github/workflows/new-relic-change-tracking.yml`
- `.github/workflows/release.yml`
- `.releaserc.json` only if necessary for explicit release/deploy coupling
- Supporting docs for workflow behavior

## Forbidden change shapes

- Marker emitted from `release.published` while release remains independent of production deploy
- Marker emitted from plain `push` to `main`
- Marker emitted from a path that can run when production deploy is skipped or fails
- Hidden coupling that implies release equals deploy without explicit dependency and evidence

## Governance constraints

- Treat documented GitHub rulesets as intent, not confirmed runtime truth, unless repository settings are verified.
- Preserve low blast radius; do not redesign unrelated CI/CD workflows to solve this specific deployment-marker problem.
- Keep workflow ownership boundaries explicit: production deploy manages rollout truth, release manages versioning metadata, and any final New Relic workflow manages observability signaling.

## Validation constraints

- Validation should stay focused on workflow semantics and scenario coverage.
- Do not add broad new test layers by default.
- Future implementation must document expected behavior for at least these scenarios:
  - release exists and production deploy succeeds
  - release exists and production deploy fails
  - release exists and production deploy is skipped
  - production workflow rerun behavior
  - final New Relic workflow rerun behavior after downstream partial failure

## Current blockers

- Leantime task open step is blocked in this session because no command-execution tool is available to run `pnpm lt` operations.
- Governance for manual release publication remains unverified in this session.
