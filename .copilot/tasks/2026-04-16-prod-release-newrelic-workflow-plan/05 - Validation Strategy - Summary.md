# 05 - Validation Strategy - Summary

## Scope handled

Assessed the minimum safe validation posture for a future workflow-only change involving production deployment markers and New Relic change tracking.

## Actions performed

- Reviewed release, production deploy, New Relic marker, and PR validation workflows
- Assessed validation risk surface for workflow-truth attribution
- Scoped minimum safe validation to the actual change surface

## Findings

- The dominant risk is incorrect deployment truth attribution: release publication versus successful production deployment.
- Existing PR validation is code-quality oriented and does not directly validate GitHub Actions behavior.
- This task does not justify broad unit, integration, E2E, or app-runtime test expansion.

## Decisions / recommendation

Minimum safe validation for a future workflow-only change should include:

- Focused workflow diff review across `release.yml`, `prod-deploy.yml`, and `new-relic-change-tracking.yml`
- Explicit scenario table covering deploy success, deploy failure, deploy skipped, and rerun behavior
- Review of trigger source, `if` conditions, dependency edges, outputs, and secrets use
- Artifact-backed explanation of why the chosen workflow path is the production source of truth

## Optional validation not justified by default

- Broad repository test expansion
- Playwright or Vitest coverage
- Full local GitHub Actions emulation infrastructure
- Broad CI/CD redesign

## Validation evidence guidance

Future validation artifacts should document:

- Which workflow or job is treated as production truth source
- Which scenarios were checked conceptually or validated in workflow logic
- Why release publication alone is insufficient
- The exact post-change path that emits the deployment marker
- Whether the final marker path remains retryable after partial downstream failure

## Blockers / unknowns

- If the final design uses `release.published` again, validation must also prove that release publication is already downstream of successful production deployment and note any residual manual-release drift risk.

## Handoff notes

Keep validation focused on workflow semantics and event wiring. Do not add broad tests unless the implementation surface expands materially beyond workflow logic. Explicitly check retryability whenever a downstream workflow depends on upstream release state.
