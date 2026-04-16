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
- The original `new-relic-change-tracking.yml` attachment to `release.published` was architecturally drift-prone and has now been removed.
- Release and production deployment are now explicitly ordered through `workflow_run`, so release publication no longer precedes deployment success in the normal repository topology.
- The final repository shape preserves separation of concerns while making production deployment success the prerequisite for release creation.

## Decisions / recommendation

- Treat successful completion of `prod-deploy.yml` as the source of truth for any production deployment marker.
- Keep release and deploy as separate concerns unless the repository intentionally redesigns them into a single orchestrated flow.
- Do not treat `release.published` as a safe proxy for production deployment in the current repository topology.
- If both facts matter, model them as separate signals: release published and production deployed.

## Allowed workflow shapes

- Marker emitted directly inside `prod-deploy.yml` after successful deploy
- Marker emitted by a separate `workflow_run` workflow gated on successful completion of `prod-deploy.yml`
- Separate release and deploy workflows with strict ownership boundaries

## Forbidden workflow shapes

- Production deployment marker emitted from `release.published`
- Any design that assumes release equals deploy without explicit coupling
- Emitting a production marker from a broader event path than the real production deployment authority

## Blockers / unknowns

- Desired marker identity is still unresolved: semantic version, commit SHA, or both.
- GitHub UI ruleset enforcement is documented in-repo but not confirmed from repository settings in this session.

## Handoff notes

The workflow split is not the problem; the problem was attaching production-facing observability to the release workflow instead of the production deploy workflow. The final implementation preserves the ownership boundary and adds explicit release-after-deploy ordering.
