# Task Index

This index tracks the current status of every task folder under `.copilot/tasks/`.

Repository artifacts inside each task directory remain the source of truth. This file is only an aggregate view to make progress visible and to separate tasks that are clearly closed from tasks that still need follow-up or a manual review.

## Classification Rules

- `confirmed complete`: the task has an explicit `COMPLETE` or `COMPLETED` signal, or a fully checked plan with no remaining blocker or deferred work that would change the task outcome
- `partial/deferred`: the task is mostly done, but the artifacts still record deferred validation, broader follow-up, or a remaining known gap
- `active/blocked`: the task explicitly says `in_progress`, `blocked`, or otherwise states that the work is still open
- `unclear`: the task folder exists, but the current artifacts are too light or too inconsistent to call it 100% complete without a manual review

## Summary

| Status             | Count |
| ------------------ | ----: |
| confirmed complete |    46 |
| partial/deferred   |     1 |
| active/blocked     |     4 |
| unclear            |     1 |
| total              |    52 |

## Confirmed Complete

These are the tasks that can currently be treated as 100% finished based on the artifacts now in the repository.

| Task                                                                                                            | Focus                                                 | Basis                                                                                                                                                    |
| --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [2026-03-19-auth-regression-verification](./2026-03-19-auth-regression-verification/)                           | Auth regression verification workflow                 | Plan and supporting artifacts marked completed                                                                                                           |
| [2026-03-19-universal-workflow-setup](./2026-03-19-universal-workflow-setup/)                                   | Universal workflow setup                              | Plan, implementation report, and validation report together mark the reusable workflow refactor complete                                                 |
| [2026-03-19-workflow-orchestrator](./2026-03-19-workflow-orchestrator/)                                         | Workflow orchestrator creation                        | Plan plus implementation report show the orchestrator was introduced, then later generalized by the universal workflow refactor                          |
| [2026-03-20-specialist-artifact-discipline](./2026-03-20-specialist-artifact-discipline/)                       | Specialist artifact discipline cleanup                | Completed checklist plus repository instruction/template evidence confirm the persistent specialist-summary discipline was added                         |
| [2026-03-20-general-neutral-07-08-09](./2026-03-20-general-neutral-07-08-09/)                                   | Neutral docs for agents 07/08/09                      | Implementation summary marked `COMPLETED`                                                                                                                |
| [2026-03-31-next-16-2-upgrade-review](./2026-03-31-next-16-2-upgrade-review/)                                   | Next.js 16.2 upgrade review                           | All listed artifacts marked completed                                                                                                                    |
| [2026-04-01-neon-auth-selection-review](./2026-04-01-neon-auth-selection-review/)                               | Neon auth selection review                            | Final validation completed and implementation hardening recorded                                                                                         |
| [2026-04-03-codacy-findings-review](./2026-04-03-codacy-findings-review/)                                       | Codacy findings triage and runtime fixes              | Specialist summaries marked `COMPLETED`; residual code risk recorded as `0`                                                                              |
| [2026-04-04-bucket1-bucket2-fixes](./2026-04-04-bucket1-bucket2-fixes/)                                         | Gap-analysis follow-up implementation                 | Implementation plan and validation report marked completed                                                                                               |
| [2026-04-04-gap-analysis-followup](./2026-04-04-gap-analysis-followup/)                                         | Grouping and sequencing of gap-analysis items         | All phases checked off; follow-up routed to completed task                                                                                               |
| [2026-04-05-nr-browser-spa](./2026-04-05-nr-browser-spa/)                                                       | New Relic browser SPA integration                     | Plan status says complete                                                                                                                                |
| [2026-04-05-per-request-caching](./2026-04-05-per-request-caching/)                                             | Per-request caching implementation                    | Plan status says complete and validated                                                                                                                  |
| [2026-04-06-codex-all-workflows](./2026-04-06-codex-all-workflows/)                                             | Codex workflow skill coverage                         | Plan status says completed                                                                                                                               |
| [2026-04-06-codex-architecture-guard-skill](./2026-04-06-codex-architecture-guard-skill/)                       | Codex architecture-guard skill                        | Plan status says completed                                                                                                                               |
| [2026-04-06-codex-debug-investigation-skill](./2026-04-06-codex-debug-investigation-skill/)                     | Codex debug-investigation skill                       | Plan status says completed                                                                                                                               |
| [2026-04-06-codex-implementation-skill](./2026-04-06-codex-implementation-skill/)                               | Codex implementation skill                            | Plan status says completed                                                                                                                               |
| [2026-04-06-codex-nextjs-runtime-skill](./2026-04-06-codex-nextjs-runtime-skill/)                               | Codex Next.js runtime skill                           | Plan status says completed                                                                                                                               |
| [2026-04-06-codex-orchestrator-task-brief-skills](./2026-04-06-codex-orchestrator-task-brief-skills/)           | Codex orchestrator and task-brief skills              | Plan status says completed                                                                                                                               |
| [2026-04-06-codex-playwright-e2e-and-workflow-roadmap](./2026-04-06-codex-playwright-e2e-and-workflow-roadmap/) | Codex Playwright E2E and workflow roadmap             | Plan status says completed                                                                                                                               |
| [2026-04-06-codex-safe-refactor-workflow](./2026-04-06-codex-safe-refactor-workflow/)                           | Codex safe-refactor workflow                          | Plan status says completed                                                                                                                               |
| [2026-04-06-codex-security-auth-skill](./2026-04-06-codex-security-auth-skill/)                                 | Codex security/auth skill                             | Plan status says completed                                                                                                                               |
| [2026-04-06-codex-validation-strategy-skill](./2026-04-06-codex-validation-strategy-skill/)                     | Codex validation-strategy skill                       | Plan status says completed                                                                                                                               |
| [2026-04-12-observability-multi-provider](./2026-04-12-observability-multi-provider/)                           | Observability multi-provider plan                     | Plan status says complete                                                                                                                                |
| [2026-04-13-clerk-prod-migration](./2026-04-13-clerk-prod-migration/)                                           | Clerk production instance migration                   | Checklist is fully complete, including validation and closeout                                                                                           |
| [2026-04-18-codacy-check-plan](./2026-04-18-codacy-check-plan/)                                                 | Codacy remediation planning and closeout              | All remediation buckets completed; final rerun returned zero findings                                                                                    |
| [2026-04-18-continue-checks-plan](./2026-04-18-continue-checks-plan/)                                           | Continue-checks workflow update                       | Plan status says `COMPLETED`                                                                                                                             |
| [2026-04-18-db-dev-up-investigation](./2026-04-18-db-dev-up-investigation/)                                     | `pnpm db:dev:up` investigation                        | Investigation checklist fully complete                                                                                                                   |
| [2026-04-18-db-flow-finalization](./2026-04-18-db-flow-finalization/)                                           | Final DB command surface cleanup                      | Full artifact set complete and final decision recorded                                                                                                   |
| [2026-04-21-authjs-phase72](./2026-04-21-authjs-phase72/)                                                       | AuthJS Phase 7.2                                      | Plan status says complete                                                                                                                                |
| [2026-04-22-email-adapters](./2026-04-22-email-adapters/)                                                       | Email adapter task                                    | Plan status says complete                                                                                                                                |
| [2026-04-23-admin-ui](./2026-04-23-admin-ui/)                                                                   | Admin UI avatar header and admin section              | Implementation, focused unit validation, AuthJS browser proof, and focused admin browser proof are now recorded as complete                              |
| [2026-04-23-invite-flow-fix](./2026-04-23-invite-flow-fix/)                                                     | Invite flow fixes                                     | Plan status says complete                                                                                                                                |
| [2026-04-24-admin-direct-invitation](./2026-04-24-admin-direct-invitation/)                                     | Direct admin invitation flow                          | Plan status says complete                                                                                                                                |
| [2026-04-24-admin-user-management](./2026-04-24-admin-user-management/)                                         | Admin user management                                 | Plan status says complete; implementation and validation recorded                                                                                        |
| [2026-04-25-admin-access-regression](./2026-04-25-admin-access-regression/)                                     | Admin access regression fix                           | Root cause, regression tests, E2E coverage, and anti-pattern documentation are complete; remaining notes are separate follow-up concerns                 |
| [2026-04-25-leantime-full-audit](./2026-04-25-leantime-full-audit/)                                             | Leantime and task-artifact audit                      | Plan status says complete; task explicitly closed                                                                                                        |
| [2026-04-26-first-pr-split](./2026-04-26-first-pr-split/)                                                       | First PR split planning                               | Planning objective is complete and later artifacts confirm the split continued through later PR slices                                                   |
| [2026-04-26-pr48-review-followups](./2026-04-26-pr48-review-followups/)                                         | PR48 review follow-up fixes                           | Checklist fully complete and triage outcome recorded                                                                                                     |
| [2026-04-26-onboarding-loop-authflow-review](./2026-04-26-onboarding-loop-authflow-review/)                     | Onboarding loop and auth flow review                  | Approved remediation slice, focused AuthJS browser proof, and supporting validation are complete; broader matrix reruns are optional follow-up hardening |
| [2026-05-04-auth-findings-preview-deploy](./2026-05-04-auth-findings-preview-deploy/)                           | Auth findings and preview deploy fix                  | Checklist fully complete                                                                                                                                 |
| [2026-05-04-db-tests-ci-root-cause](./2026-05-04-db-tests-ci-root-cause/)                                       | DB test CI root cause analysis                        | Checklist fully complete                                                                                                                                 |
| [2026-05-04-pnpm-audit-remediation](./2026-05-04-pnpm-audit-remediation/)                                       | `pnpm audit` remediation                              | Implementation summary and validation report marked completed                                                                                            |
| [2026-05-05-admin-bootstrap-deploy-design](./2026-05-05-admin-bootstrap-deploy-design/)                         | Admin bootstrap deploy design and implementation plan | Task scope is design and implementation planning; that scope is marked complete                                                                          |
| [2026-05-06-preview-migration-compatibility-refactor](./2026-05-06-preview-migration-compatibility-refactor/)   | Preview migration compatibility refactor              | Plan, implementation summary, and focused validation all mark the task complete                                                                          |
| [2026-04-27-vercel-log-scripts](./2026-04-27-vercel-log-scripts/)                                               | Vercel log scripts                                    | Plan, implementation summary, and validation now consistently mark the slice complete                                                                    |
| [investigate-ci-migrations](./investigate-ci-migrations/)                                                       | CI migration investigation                            | Plan status says completed                                                                                                                               |

## Partial Or Deferred

These tasks are substantially advanced, but the artifacts still record deferred work or a remaining gap, so they are not counted as 100% finished.

| Task                                                                      | Focus                             | Why not 100% closed                                                              |
| ------------------------------------------------------------------------- | --------------------------------- | -------------------------------------------------------------------------------- |
| [2026-04-18-eslint-security-signal](./2026-04-18-eslint-security-signal/) | Shift-left ESLint security signal | One remaining internal API browser scenario is still noted as failing with `403` |

## Active Or Blocked

These tasks are explicitly open in the current artifacts.

| Task                                                                                                | Focus                                          | Current state                                                                      |
| --------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------- |
| [2026-04-08-vercel-newrelic-incident](./2026-04-08-vercel-newrelic-incident/)                       | Vercel and New Relic incident                  | Marked `in_progress`                                                               |
| [2026-04-16-prod-release-newrelic-workflow-plan](./2026-04-16-prod-release-newrelic-workflow-plan/) | Production release and New Relic workflow plan | Explicitly blocked by unavailable command execution in that run                    |
| [2026-04-17-auth-foundation-redesign](./2026-04-17-auth-foundation-redesign/)                       | Auth foundation redesign epic                  | Explicitly `IN PROGRESS`; later phases still open                                  |
| [2026-04-17-authjs-adapter](./2026-04-17-authjs-adapter/)                                           | AuthJS adapter design and implementation       | Architecture and security artifacts both mark it as blocking pending user decision |

## Unclear

These tasks may already be done, but the current folder contents do not provide a strong enough closeout signal to classify them as 100% complete without a manual artifact review.

| Task                                                                                  | Focus                                   | Why it stays unclear                                                                                                                                                 |
| ------------------------------------------------------------------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [2026-04-12-vercel-nr-proper-integration](./2026-04-12-vercel-nr-proper-integration/) | Proper Vercel and New Relic integration | Folder contains investigation/design artifacts, but the intake is still `in_progress` and the remediation plan explicitly awaits user approval before implementation |

## Maintenance Notes

- When a task changes state, update the task-local artifacts first, then update this index.
- Do not promote a task into `confirmed complete` if its artifacts still mention deferred validation, open blockers, or remaining follow-up that affects the task outcome.
- If a task folder only contains exploratory notes and no explicit closeout signal, keep it in `unclear` until a manual review resolves it.
