# Validation Report

## Scope

Focused validation of the workflow-only change that corrects the ordered deployment, release, and New Relic topology by moving New Relic into its own final retryable workflow while keeping semantic-release version metadata.

## Files validated

- `.github/workflows/prod-deploy.yml`
- `.github/workflows/release.yml`
- `.github/workflows/new-relic-change-tracking.yml`
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
- Confirmed the inline New Relic step has been removed from `release.yml`
- Confirmed `new-relic-change-tracking.yml` now triggers from `release.published`
- Confirmed the final workflow normalizes semantic version from the published tag and resolves the tagged commit before emitting the New Relic event
- Confirmed repository docs now describe the ordered deploy -> release -> New Relic workflow model and the retryability rationale

### Scenario review

| Scenario                                                             | Expected result                                                                                                                     | Status                                          |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Production deploy succeeds and semantic-release publishes a version  | Release workflow runs, publishes a release, and the final New Relic workflow emits the production event with semver + tagged commit | Verified by workflow topology                   |
| Production deploy succeeds but semantic-release publishes no version | Release workflow runs but no release is published, so the final New Relic workflow does not trigger                                 | Verified by trigger ownership                   |
| Production deploy fails before deploy step completes                 | Release workflow does not run and no New Relic event is emitted                                                                     | Verified by step ordering and workflow_run gate |
| Production deploy is skipped due to `paths-ignore`                   | Release workflow does not run and no New Relic event is emitted                                                                     | Verified by trigger ownership                   |
| New Relic workflow fails after release publication                   | The final New Relic workflow can be rerun independently with the same release payload                                               | Verified by workflow topology                   |
| Production deploy workflow rerun after success                       | Release workflow reruns, but the final New Relic workflow should only retrigger if another release is actually published            | Documented residual behavior                    |

### Editor diagnostics

- `get_errors` reported no errors in `.github/workflows/prod-deploy.yml`
- `get_errors` reported no errors in `.github/workflows/release.yml`
- `get_errors` reported no errors in `docs/features/19 - CI-CD & Lighthouse CI.md`

## Outcome

The repository now uses an explicitly ordered deploy -> release -> New Relic model with independent retryability at the final New Relic stage. Production deployment remains the upstream truth gate, release remains a separate downstream workflow, and the New Relic event uses semantic version as the visible release identifier plus the tagged Git SHA as commit metadata.

## Residual risks

1. Manual GitHub release publication outside the ordered release workflow would still trigger the final New Relic workflow unless governance prevents it.
2. GitHub UI ruleset enforcement remains unverified from this session.
3. The expectation that semantic-release will no-op safely on rerun is strong and standard, but was not verified by running a live GitHub Actions execution in this session.
4. The version normalization step assumes the published tag format remains `v<semver>`.

## Recommended follow-up

1. If manual GitHub releases should never emit production markers, add governance or workflow gating that proves the release originated from the ordered deploy -> release path.
2. If desired, live-verify one production-like run in GitHub Actions to prove the published release triggers the final New Relic workflow with the expected version and commit values.
