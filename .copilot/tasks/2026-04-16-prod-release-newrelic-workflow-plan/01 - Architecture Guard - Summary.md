# 01 - Architecture Guard - Summary

## Scope handled

Reviewed the live workflow topology and repository CI/CD guidance for production deployment, release automation, and New Relic change tracking.

## Actions performed

- Reviewed `.github/workflows/prod-deploy.yml`
- Reviewed `.github/workflows/release.yml`
- Reviewed `.github/workflows/new-relic-change-tracking.yml`
- Reviewed `.releaserc.json`
- Reviewed supporting CI/CD and deployment docs

## Findings

- `prod-deploy.yml` is the only workflow that represents real production deployment truth in this repository.
- `release.yml` remains a separate release-management workflow that owns semantic-release, tags, changelog, and GitHub Releases.
- The original `new-relic-change-tracking.yml` attachment to `release.published` was architecturally drift-prone only because release and deployment were previously independent.
- Release and production deployment are now explicitly ordered through `workflow_run`, so release publication no longer precedes deployment success in the normal repository topology.
- Restoring `new-relic-change-tracking.yml` as the final workflow is now architecturally acceptable because it is downstream of the ordered deploy -> release path and preserves independent retryability.

## Decisions / recommendation

- Treat successful completion of `prod-deploy.yml` as the upstream source of truth for any production deployment marker.
- Keep release and deploy as separate concerns unless the repository intentionally redesigns them into a single orchestrated flow.
- Do not treat `release.published` as a safe proxy for production deployment unless release itself is already downstream of successful production deployment.
- If a final human-readable semver marker is required, a dedicated workflow triggered by the published release is now a valid shape in this repository.

## Allowed workflow shapes

- Marker emitted directly inside `prod-deploy.yml` after successful deploy
- Marker emitted by a separate `workflow_run` workflow gated on successful completion of `prod-deploy.yml`
- Marker emitted by a dedicated `release.published` workflow only when release publication is already downstream of successful production deployment
- Separate release and deploy workflows with strict ownership boundaries

## Forbidden workflow shapes

- Production deployment marker emitted from `release.published` when release is still independent of deployment
- Any design that assumes release equals deploy without explicit coupling
- Emitting a production marker from a broader event path than the real production deployment authority

## Blockers / unknowns

- Marker identity is now resolved as semantic version plus tagged commit.
- GitHub UI ruleset enforcement is documented in-repo but not confirmed from repository settings in this session.

## Handoff notes

The workflow split is not the problem; the problem was attaching production-facing observability to a release event that was not yet ordered behind production deployment. The corrected implementation preserves the ownership boundary, keeps release-after-deploy ordering, and restores New Relic retryability in a final dedicated workflow.
