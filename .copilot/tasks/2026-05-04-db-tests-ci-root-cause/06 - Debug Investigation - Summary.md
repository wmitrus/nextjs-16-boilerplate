# 06 - Debug Investigation - Summary

## Task Context

- Task ID: `2026-05-04-db-tests-ci-root-cause`
- Task Objective: Find the valid root cause of PR 50 DB-test CI failures and validate only the real fix
- Current Run Scope: DB test reproduction, migration-path verification, isolated fix validation
- Status: COMPLETED
- Last Updated: 2026-05-04
- Related Control Artifacts: `plan.md`, `intake.md`

## Scope Handled

- modules / files reviewed: `DrizzleProvisioningService.db.test.ts`, `DrizzleProvisioningService.ts`, DB migration generated files, CI log artifact, `tests/db/setup.postgres.ts`, `create-test-db.ts`
- investigation goals in scope: determine whether failure is branch-only, merge-only, env-only, or migration-artifact drift
- constraints applied: no speculative fix, reproduction required

## Inputs Reviewed

- code paths reviewed: provisioning user insert path and migration setup path
- upstream specialist artifacts reviewed: none
- earlier implementation notes reviewed: none

## Actions Performed

- reproduced the historical CI merge commit locally in `/tmp/pr50-merge-debug`
- reproduced the exact DB failure on that merge tree
- confirmed the exact error was `column "deactivated_at" of relation "users" does not exist`
- confirmed the merge tree lacked `0012_users_deactivated_at.sql` and the corresponding journal entry
- validated the narrowest fix in the temp worktree by adding only the missing migration file and journal entry, then rerunning the failing DB test file successfully

## Files Changed

- production files: none in the main workspace
- test files: none in the main workspace
- docs / artifact files: this task artifact set

## Root Cause Summary

The CI merge tree for PR 50 expected the `users.deactivated_at` column at runtime, but its committed migration set did not include the migration that adds that column. `DrizzleProvisioningService` generated inserts against `deactivated_at`, while the fresh CI Postgres schema created by `runMigrations()` did not have the column because `0012_users_deactivated_at.sql` and the matching journal entry were missing from the committed tree.

## Validated Fix Summary

The minimal validated runtime fix is to commit the missing migration artifact that adds `users.deactivated_at` and the matching `_journal.json` entry so fresh CI databases apply that column before DB tests run.

## Validation Performed

- commands run: exact merge-ref reproduction and focused Vitest DB reruns
- results: historical failure reproduced; minimal migration fix made the same failing test file pass
- validation not run: no broad repo validation was needed for root-cause confirmation
- residual risk from validation gaps: Drizzle metadata companion files should also be kept consistent when committing the migration artifacts

## Handoff Notes

- next action in the main workspace should be to commit the missing migration artifacts already present locally
- do not substitute dependency bumps or test rewrites for this fix; they do not address the reproduced cause
