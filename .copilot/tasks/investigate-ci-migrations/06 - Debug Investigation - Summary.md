# 06 - Debug Investigation - Summary

## Task Context

- Task ID: investigate-ci-migrations
- Task Objective: Determine whether migrations execute automatically in CI outside the explicit preview and production deploy steps, and explain what likely produced prior migration logs.
- Current Run Scope: workflow, script, and runtime tracing for migration entrypoints, then preview feature-flags table absence after migration success
- Status: COMPLETED
- Last Updated: 2026-04-04
- Related Control Artifacts: plan.md, intake.md

## Scope Handled

- symptom or flow investigated: migration execution during CI and deploy pipelines; missing `feature_flags` table in preview DB after successful migration log
- runtime surfaces investigated: GitHub Actions workflows, package scripts, test setup, E2E setup, migration helper code, generated migration set
- env or timing questions investigated: preview/prod env pull, branch-scoped preview env targeting, test DB setup timing, E2E backend mode selection

## Inputs Reviewed

- code paths reviewed: deploy workflows, db-tests workflow, e2e workflows, package scripts, test DB helpers, E2E scenario runner, migration runner, generated migration SQL, feature-flags schema
- logs / diagnostics reviewed: user-provided preview migration log snippet; git history for workflow and feature-flag migration introduction only; no GitHub Actions log bundle with env diagnostics provided in workspace
- tests / task artifacts reviewed: vitest db CI config, README, DEPLOY-neon docs, feature flags docs

## Actions Performed

- reproduction attempts performed: none; investigation stayed read-only
- execution-path tracing performed: yes
- source-of-truth tracing performed: yes
- evidence collection performed: yes

## Symptom Summary

- observed symptom: preview workflow reports `migrations applied successfully`, but the user still does not see `public.feature_flags` in the preview database they inspected
- where it surfaces: GitHub Actions preview deploy logs and subsequent DB inspection
- reproducibility: migration success is confirmed by the provided log snippet; missing-table state is reported by the user but not directly inspected from workspace
- trigger conditions: preview deploy workflow for PR branch

## Confirmed Evidence

- code facts: preview and prod deploy workflows explicitly run `pnpm db:migrate:prod` after loading `DATABASE_URL_UNPOOLED`
- code facts: preview workflow uses `vercel pull --yes --environment=preview --git-branch=${{ github.head_ref }}` to target PR-scoped preview env
- code facts: `drizzle.prod.ts` applies the full committed migration set from `src/core/db/migrations/generated`
- code facts: committed migration `0006_breezy_scarlet_spider.sql` creates `public.feature_flags`
- code facts: committed migration `0007_zippy_gorilla_man.sql` alters `feature_flags.tenant_id` to `text` and re-adds the unique constraint; no later migration drops or renames `feature_flags`
- code facts: generated migration journal includes entries through `0007_zippy_gorilla_man`
- runtime evidence: the provided CI log confirms `drizzle-kit migrate` completed successfully, but it does not print the target host/database/branch name

## Execution Path

- entry point: preview deploy workflow step in `.github/workflows/preview-deploy.yml`
- critical path: `vercel pull --environment=preview --git-branch=...` -> source `.vercel/.env.preview.local` -> `export DATABASE_URL="$DATABASE_URL_UNPOOLED"` -> `pnpm db:migrate:prod`
- state transitions: Vercel writes preview env file -> workflow remaps to direct Neon URL -> Drizzle applies migrations according to `drizzle.__drizzle_migrations` state -> build/deploy proceeds
- failure boundary: the current log proves the migration command succeeded, but not that the DB later inspected by the user is the same branch DB targeted by `DATABASE_URL_UNPOOLED`

## Hypotheses And Failure Points

- likely failure points: inspected DB is not the same PR-scoped preview DB used by the workflow
- likely failure points: the correct preview DB has migration-history drift, where `drizzle.__drizzle_migrations` records `0006`/`0007` but `public.feature_flags` was dropped or never materialized due to out-of-band changes
- hypotheses: the workflow code is currently correct for targeting the PR-scoped preview env; the missing table is more likely a DB identity/drift issue than a missing migration file
- disproven possibilities: feature-flags table missing from the committed prod migration set; later migration intentionally dropping or renaming the table; implicit install/build/runtime migrations being the cause

## Missing Evidence / Uncertainty

- what remains unclear: the exact host/database/branch encoded in the `DATABASE_URL_UNPOOLED` value used during the successful preview migration run
- what remains unclear: whether `drizzle.__drizzle_migrations` in the inspected preview DB contains rows for `0006_breezy_scarlet_spider` and `0007_zippy_gorilla_man`
- what evidence would reduce uncertainty fastest: a sanitized print of DB host and database name during the preview migration step, plus two SQL checks against the inspected preview DB:
  - `select * from drizzle.__drizzle_migrations order by created_at desc;`
  - `select schemaname, tablename from pg_tables where tablename = 'feature_flags';`
- external dependencies or blockers: GitHub Actions log snippet does not expose DB identity; workspace has no direct access to the preview DB

## Artifact Synchronization

- `plan.md` updates: unchanged; still accurate
- `intake.md` updates: unchanged; still accurate
- `implementation-plan.md` updates: not applicable for investigation-only task
- specialist artifact updates: this file refreshed with preview-DB/feature-flags findings

## Handoff Notes

- what the next agent should rely on: workflow targeting logic and migration set both include the feature-flags table; the unresolved issue is DB identity or drift, not missing migration code
- what remains unproven: whether the inspected DB is the same preview branch DB that CI migrated
- recommended next specialist or step: no specialist handoff required unless you want an implementation patch to add sanitized DB-target diagnostics to preview/prod workflows

## Update Log

### Update Entry 01

- Date: 2026-04-04
- Trigger: initial investigation
- Summary of change: traced all current migration entrypoints across deploy, DB test, and E2E CI paths
- Sections refreshed: all

### Update Entry 02

- Date: 2026-04-04
- Trigger: follow-up investigation of missing `feature_flags` table in preview after migration success
- Summary of change: confirmed `feature_flags` is in the committed prod migration set and narrowed the issue to DB targeting identity or schema drift
- Sections refreshed: Task Context, Scope Handled, Inputs Reviewed, Symptom Summary, Confirmed Evidence, Execution Path, Hypotheses And Failure Points, Missing Evidence / Uncertainty, Handoff Notes, Update Log

### Update Entry 03

- Date: 2026-04-04
- Trigger: user requested sanitized DB-target diagnostics in preview workflow
- Summary of change: added a preview migration log line that prints branch, host, and database name parsed from DATABASE_URL_UNPOOLED before pnpm db:migrate:prod
- Sections refreshed: implementation follow-up only

### Update Entry 04

- Date: 2026-04-04
- Trigger: docs verification for Neon/Vercel integration build behavior
- Summary of change: confirmed from Neon docs that preview-branch integrations inject branch-specific env vars and recommend adding migrations to Vercel Build Command; confirmed from Vercel docs that Build Command is a normal project override, so current duplicate migration comes from Vercel project settings rather than hidden integration runtime behavior
- Sections refreshed: evidence follow-up only

### Update Entry 05

- Date: 2026-04-04
- Trigger: user provided drizzle.\_\_drizzle_migrations rows from inspected preview DB
- Summary of change: confirmed the inspected DB records latest feature-flags migrations as applied; this shifts the leading root-cause hypothesis to inherited schema drift from the source branch/default database, because Drizzle will not recreate feature_flags when migration history already includes 0006/0007
- Sections refreshed: root-cause narrowing only

### Update Entry 06

- Date: 2026-04-04
- Trigger: user requested implementation fix for preview branch migrations
- Summary of change: changed preview workflow to use remote `vercel deploy` instead of local prebuild migration/build steps, and updated Neon deployment guidance to document Vercel-owned preview migrations for automated preview branches
- Sections refreshed: implementation fix applied

### Update Entry 07

- Date: 2026-04-04
- Trigger: preview deploy log showed migration success but build failed during TypeScript
- Summary of change: confirmed migration now succeeds on the real preview branch DB; fixed the actual remaining build blocker by moving the TEST_DATABASE_URL Vitest context augmentation into the shared vitest.shims.d.ts file so production typechecking sees it
- Sections refreshed: final fix validation
