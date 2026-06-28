# 05 - Validation Strategy - Summary

## Task Context

- Task ID: investigate-ci-migrations
- Task Objective: determine the minimum safe validation for the deploy-time migration reconciliation wrapper that protects preview without risking production
- Current Run Scope: change-level validation for the new `db:migrate:prod` wrapper and known 0010/0011 drift checks
- Mode: CHANGE VALIDATION
- Status: COMPLETED
- Last Updated: 2026-04-27
- Related Control Artifacts: `plan.md`, `intake.md`, `implementation-plan.md`, `06 - Debug Investigation - Summary.md`

## Scope Handled

- change surfaces assessed: `scripts/db-migrate-prod.ts`, `scripts/reconcile-known-migration-state.ts`, `scripts/reconcile-known-migration-state.test.ts`, `package.json`
- validation questions in scope: whether the wrapper backfills only the intended historical drift; whether it stays a no-op on healthy production; whether repo lint/typecheck remain clean after package-script rewiring
- excluded validation areas: browser E2E, auth-flow E2E, route-handler runtime behavior unrelated to deploy-time migration execution

## Inputs Reviewed

- code paths reviewed: prod migration wrapper, reconciliation logic, journal metadata, migration SQL files, package scripts
- tests / configs / workflows reviewed: `vitest.unit.config.ts`, `package.json`, preview deploy log, repo lint/typecheck commands
- earlier task artifacts reviewed: `plan.md`, `intake.md`, `implementation-plan.md`, `06 - Debug Investigation - Summary.md`

## Actions Performed

- validation posture review performed: yes
- risk analysis performed: yes
- test-level recommendations prepared: yes
- command recommendations prepared: yes

## Current-State Findings

- Confirmed: the highest-risk behavior is schema/journal divergence in deploy-time DB migrations, not app runtime code
- Confirmed: a narrow unit test around reconciliation planning gives strong signal for the intended decision boundary
- Confirmed: a production `--check` run gives direct evidence that the wrapper will not backfill `0010`/`0011` on current production
- Risks: preview repair cannot be fully proven locally without Vercel-backed preview DB access
- Drift: production is behind on `0012`/`0013`, but not desynchronized for `0010`/`0011`

## Validation-Risk Assessment

- primary risks: accidentally backfilling healthy databases; silently masking partial schema drift; breaking the package-level prod migration entrypoint
- confidence gaps: no local authenticated access to the preview branch DB
- over-validation or under-validation concerns: Playwright or broad integration expansion would add cost without touching the deploy-time risk surface; repo-wide lint/typecheck remain justified because package scripts changed

## Recommended Validation Scope

- minimum required validation: focused Vitest on reconciliation planner; check-only wrapper execution against production env; repo-wide `pnpm lint --fix`; repo-wide `pnpm typecheck`; next preview deployment log review
- optional additional validation: manual operator run of `node --env-file=.env.production --import tsx scripts/db-migrate-prod.ts --check` after future migration additions if another historical drift is suspected
- validation explicitly not required: browser E2E, auth-flow scenario runner, unit tests for unrelated migration files, full DB integration suite for this change alone

## Validation Commands / Checks

- commands to run: `pnpm exec vitest run --config vitest.unit.config.ts --coverage.enabled=false scripts/reconcile-known-migration-state.test.ts`; `node --env-file=.env.production --import tsx scripts/db-migrate-prod.ts --check`; `pnpm lint --fix`; `pnpm typecheck`
- environment prerequisites: local `.env.production` with DB access for the check-only run
- expected evidence: passing planner test; production check-only result with empty `backfilled`; clean lint/typecheck; next preview deploy either succeeding or failing with a clearer partial-drift blocker instead of `relation already exists`

## Artifact Synchronization

- `plan.md` updates: reflected completed validation items
- `intake.md` updates: reflected completed validation-readiness item
- `implementation-plan.md` updates: reflected completed validation phase
- specialist artifact updates: created `05 - Validation Strategy - Summary.md`

## Open Questions / Blockers

- unresolved questions: whether the next preview deploy fully self-heals the preview branch DB as expected
- blockers: no local Vercel credentials for direct preview DB inspection
- dependencies on architecture / security / runtime decisions: none; the change stays at the deploy-script boundary

## Handoff Notes

- what the next agent should rely on: this change needs deploy-log verification, not more local test-surface expansion
- what should not be re-decided without new evidence: the validation level; focused script validation is the correct level for this change
- recommended next specialist or step: implementation complete; monitor the next preview deploy result

## Update Log

### Update Entry

- Date: 2026-04-27
- Trigger: migration reconciliation wrapper implementation
- Summary of change: defined and executed the minimum safe validation for the deploy-time wrapper, including a production check-only run and repo-wide lint/typecheck
- Sections refreshed: all
