# 06 - Debug Investigation - Summary

## Task Context

- Task ID: investigate-ci-migrations
- Task Objective: Determine whether migrations execute automatically in CI outside the explicit preview and production deploy steps, and explain what likely produced prior migration logs.
- Current Run Scope: workflow, script, and runtime tracing for migration entrypoints
- Status: COMPLETED
- Last Updated: 2026-04-04
- Related Control Artifacts: plan.md, intake.md

## Scope Handled

- symptom or flow investigated: migration execution during CI and deploy pipelines
- runtime surfaces investigated: GitHub Actions workflows, package scripts, test setup, E2E setup, migration helper code
- env or timing questions investigated: preview/prod env pull, test DB setup timing, E2E backend mode selection

## Inputs Reviewed

- code paths reviewed: deploy workflows, db-tests workflow, e2e workflows, package scripts, test DB helpers, E2E scenario runner, migration runner
- logs / diagnostics reviewed: git history for workflow introduction only; no GitHub Actions log bundle provided in workspace
- tests / task artifacts reviewed: vitest db CI config, README and DEPLOY-neon docs

## Actions Performed

- reproduction attempts performed: none; investigation stayed read-only
- execution-path tracing performed: yes
- source-of-truth tracing performed: yes
- evidence collection performed: yes

## Symptom Summary

- observed symptom: user remembers seeing migration execution in CI/deploy logs and is unsure whether deploy workflows now duplicate existing automation
- where it surfaces: GitHub Actions logs across PR/deploy workflows
- reproducibility: not directly reproduced from logs in workspace
- trigger conditions: depends on which workflow ran and which DB backend mode was selected

## Confirmed Evidence

- code facts: preview and prod deploy workflows explicitly run `pnpm db:migrate:prod` after loading `DATABASE_URL_UNPOOLED`
- code facts: DB test CI runs `pnpm test:db:ci`, whose global setup starts Postgres Testcontainers and runs `runMigrations(db, 'postgres')`
- code facts: E2E workflows run `pnpm e2e:ci` or `pnpm e2e:auth-matrix:ci`; E2E scenario setup runs migrations for both PGLite and container-backed test DB modes
- code facts: no install hook, build hook, or app runtime path was found that invokes migrations implicitly during normal `pnpm install`, `next build`, or app startup

## Execution Path

- entry point: GitHub Actions workflow step
- critical path: workflow command -> package script -> helper/setup script -> migration function or drizzle-kit migrate
- state transitions: env pulled or test DB created -> database URL selected -> migrations applied -> build/tests proceed
- failure boundary: deploy workflows target preview/prod databases; db-tests and E2E workflows target isolated test databases, not deploy targets

## Hypotheses And Failure Points

- likely failure points: user-observed migration logs likely came from DB Tests or E2E workflows rather than hidden deploy-time hooks
- hypotheses: explicit deploy migration steps are not redundant with test-only CI migrations because they target different DBs and execution paths
- disproven possibilities: implicit migrations during `pnpm install`, `next build`, or application runtime startup

## Missing Evidence / Uncertainty

- what remains unclear: exact historical workflow run whose logs the user remembers
- what evidence would reduce uncertainty fastest: the specific GitHub Actions run URL or raw log excerpt showing the migration lines
- external dependencies or blockers: GitHub Actions logs are not available in workspace

## Artifact Synchronization

- `plan.md` updates: created and partially completed
- `intake.md` updates: created and partially completed
- `implementation-plan.md` updates: not applicable for investigation-only task
- specialist artifact updates: this file created

## Handoff Notes

- what the next agent should rely on: only explicit preview/prod deploy workflows migrate deploy databases; test-related CI also runs migrations, but on test/E2E databases
- what remains unproven: which exact historical workflow produced the remembered log lines
- recommended next specialist or step: no specialist handoff required unless workflow changes are requested

## Handoff Notes

- what the next agent should rely on: only explicit preview/prod deploy workflows migrate deploy databases; test-related CI also runs migrations, but on test/E2E databases
- what remains unproven: which exact historical workflow produced the remembered log lines
- recommended next specialist or step: no specialist handoff required unless workflow changes are requested

## Update Log

### Update Entry

- Date: 2026-04-04
- Trigger: initial investigation
- Summary of change: traced all current migration entrypoints across deploy, DB test, and E2E CI paths
- Sections refreshed: all
