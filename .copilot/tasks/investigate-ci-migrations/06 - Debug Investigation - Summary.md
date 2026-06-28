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

Current Run Scope: workflow, script, and runtime tracing for migration entrypoints, then preview feature-flags table absence after migration success, then April 27 preview deploy failure on `0010_password_reset_tokens`

- code paths reviewed: deploy workflows, db-tests workflow, e2e workflows, package scripts, test DB helpers, E2E scenario runner, migration runner, generated migration SQL, feature-flags schema
  observed symptom: the latest preview deploy fails before `pnpm build`, inside Drizzle migration execution, when trying to create `public.password_reset_tokens`
  where it surfaces: Vercel remote build logs invoked by the GitHub Actions preview deploy workflow
  reproducibility: deterministic for the attached preview deploy run on PR #48 / branch `feat/authjs`
  trigger conditions: preview deploy reaches Vercel build step and executes the configured Preview Build Command against the preview database

code facts: `0010_password_reset_tokens.sql` creates `public.password_reset_tokens`
code facts: the committed migration journal includes `0010_password_reset_tokens`, `0011_email_verification_tokens`, `0012_users_deactivated_at`, and `0013_reconcile_snapshot`
code facts: `0013_snapshot.json` still contains `public.password_reset_tokens`, so no later committed migration drops or renames that table
runtime evidence: the attached preview-deploy CI log shows env validation passing and then Vercel remote build executing `Running "DATABASE_URL="$DATABASE_URL_UNPOOLED" pnpm db:migrate:prod && pnpm build"`
runtime evidence: the same log fails on `CREATE TABLE "password_reset_tokens" ...` with `PostgresError: relation "password_reset_tokens" already exists` (`42P07`)
runtime evidence: because `drizzle-kit migrate` attempted `0010_password_reset_tokens`, the target database's `drizzle.__drizzle_migrations` state did not record `0010` as applied for that database at migration time
runtime evidence: because Postgres reports the relation already exists, the physical schema already contains `public.password_reset_tokens`
disproven-by-log: this failure is not happening during Next.js compilation, TypeScript, or app runtime boot; build never reaches `pnpm build`

- where it surfaces: GitHub Actions preview deploy logs and subsequent DB inspection
  entry point: GitHub Actions preview deploy job for PR #48
  critical path: `vercel pull --environment=preview --git-branch=feat/authjs` -> env validation passes -> `vercel deploy` -> Vercel remote build executes Preview Build Command -> `pnpm db:migrate:prod` reads `drizzle.__drizzle_migrations` -> Drizzle attempts `0010_password_reset_tokens` -> Postgres rejects because the table already exists
  state transitions: Vercel injects preview-branch environment -> remote build uses `DATABASE_URL_UNPOOLED` -> Drizzle decides pending migrations from journal state, not by diffing the live schema -> Postgres compares DDL against the physical schema and aborts on duplicate table creation
  failure boundary: migration state mismatch between Drizzle journal state and actual preview database schema

likely failure points: the preview database already contains tables introduced by `0010_password_reset_tokens`, but its `drizzle.__drizzle_migrations` rows lag behind that schema state
likely failure points: the preview DB inherited or retained schema objects from an earlier branch/source DB while the Drizzle journal for that branch DB did not inherit the corresponding rows
hypotheses: the direct cause of the failing deploy is schema/journal desync in the preview database, not a bad SQL file and not a missing migration in Git
disproven possibilities: `DATABASE_URL_UNPOOLED` missing or invalid; pooled-connection misuse in this run; build failure caused by Next.js compilation; `password_reset_tokens` being absent from the committed migration set; repository code dropping `password_reset_tokens` after `0010`

- code facts: committed migration `0007_zippy_gorilla_man.sql` alters `feature_flags.tenant_id` to `text` and re-adds the unique constraint; no later migration drops or renames `feature_flags`
  what remains unclear: the exact branch/database identity behind the failing preview deployment's `DATABASE_URL_UNPOOLED`
  what remains unclear: the precise mechanism that created `public.password_reset_tokens` ahead of the journal rows for `0010` in that preview DB
  what evidence would reduce uncertainty fastest: a sanitized check against the failing preview DB showing journal rows near `0010` plus the table presence:

- entry point: preview deploy workflow step in `.github/workflows/preview-deploy.yml`
- state transitions: Vercel writes preview env file -> workflow remaps to direct Neon URL -> Drizzle applies migrations according to `drizzle.__drizzle_migrations` state -> build/deploy proceeds
  what the next agent should rely on: the failing preview deploy is blocked by preview-DB schema/journal desync at `0010_password_reset_tokens`, surfaced through the Vercel Preview Build Command
  what remains unproven: the upstream operational event that created `public.password_reset_tokens` before the journal row existed in that preview DB
  recommended next specialist or step: no implementation agent needed to identify root cause; operational remediation should inspect and reconcile the preview branch database journal/state before retrying deploys

### Update Entry 08

- Date: 2026-04-27
- Trigger: user provided the latest failing preview deploy CI log for PR #48
- Summary of change: confirmed the current failure happens inside Vercel's Preview Build Command during `0010_password_reset_tokens`; narrowed the valid root cause to preview database schema/journal desync because Drizzle treats `0010` as pending while Postgres reports `password_reset_tokens` already exists
- Sections refreshed: Task Context, Symptom Summary, Confirmed Evidence, Execution Path, Hypotheses And Failure Points, Missing Evidence / Uncertainty, Handoff Notes, Update Log
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
