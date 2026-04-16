# Validation Report

## Scope

Focused validation of the workflow-only change that orders deployment, release, and New Relic change tracking so New Relic runs last and uses semantic-release version metadata.

## Files validated

- `.github/workflows/prod-deploy.yml`
- `.github/workflows/release.yml`
- `.github/workflows/new-relic-change-tracking.yml` (deletion)
- `docs/features/19 - CI-CD & Lighthouse CI.md`
- `docs/features/26 - New Relic Server & Browser Integration.md`
- `docs/features/10 - Release Automation.md`
- `docs/features/DEPLOY-manual.md`

## Validation performed

### Workflow semantics review

- Confirmed the New Relic step no longer exists in `prod-deploy.yml`
- Confirmed `release.yml` now triggers from `workflow_run` of `Production Deployment`
- Confirmed the release job is gated on successful workflow conclusion
- Confirmed checkout uses `github.event.workflow_run.head_sha`
- Confirmed the New Relic step now exists in `release.yml` after semantic-release
- Confirmed the New Relic step is gated on `RELEASED=1` and `NEW_VERSION`
- Confirmed New Relic `version` now uses semantic-release version and `commit` uses the deployed commit SHA
- Confirmed the separate `release.published` marker workflow has been removed
- Confirmed repository docs now describe the ordered deploy -> release -> New Relic model

### Scenario review

| Scenario                                                             | Expected result                                                                                           | Status                                          |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Production deploy succeeds and semantic-release publishes a version  | Release workflow runs and New Relic production deployment event is emitted with semver + commit SHA       | Verified by workflow topology                   |
| Production deploy succeeds but semantic-release publishes no version | Release workflow runs but New Relic event does not fire                                                   | Verified by `RELEASED` / `NEW_VERSION` gate     |
| Production deploy fails before deploy step completes                 | Release workflow does not run and no New Relic event is emitted                                           | Verified by step ordering and workflow_run gate |
| Production deploy is skipped due to `paths-ignore`                   | Release workflow does not run and no New Relic event is emitted                                           | Verified by trigger ownership                   |
| Production deploy workflow rerun after success                       | Release workflow reruns, but New Relic should emit only if another semantic release is actually published | Documented residual behavior                    |

### Editor diagnostics

- `get_errors` reported no errors in `.github/workflows/prod-deploy.yml`
- `get_errors` reported no errors in `.github/workflows/release.yml`
- `get_errors` reported no errors in `docs/features/19 - CI-CD & Lighthouse CI.md`

## Outcome

The repository now uses an explicitly ordered deploy -> release -> New Relic model. Production deployment remains the upstream truth gate, release remains a separate downstream workflow, and the New Relic event now uses semantic version as the visible release identifier plus deployed Git SHA as commit metadata.

## Residual risks

1. Manual reruns of successful production deployments will rerun the release workflow; duplicate New Relic events should occur only if another semantic release is actually published.
2. GitHub UI ruleset enforcement remains unverified from this session.
3. The expectation that semantic-release will no-op safely on rerun is strong and standard, but was not verified by running a live GitHub Actions execution in this session.
4. This design now depends on the semantic-release `exec` plugin continuing to set `RELEASED=1` and `NEW_VERSION` as expected.

## Recommended follow-up

1. If strict single-event semantics are required even on manual reruns, add an explicit dedupe strategy.
2. If desired, live-verify one production-like dry run in GitHub Actions to prove the semantic-release gating behaves exactly as expected.
