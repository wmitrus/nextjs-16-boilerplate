# 06 - Debug Investigation - Summary

## Task Context

- Task ID: `2026-04-24-admin-user-management`
- Task Objective: Complete the admin user-management feature and resolve the post-implementation Drizzle migration-generation failure.
- Current Run Scope: Investigate why `pnpm db:generate` duplicates migrations `0008` through `0012` after the admin feature was implemented.
- Status: COMPLETED
- Last Updated: 2026-04-25
- Related Control Artifacts: `plan.md`, `intake.md`, `implementation-plan.md`, `validation-report.md`

## Scope Handled

- symptom or flow investigated: Drizzle migration generation after admin-user-management schema work
- runtime surfaces investigated: `drizzle-kit generate`, migration metadata folder, migration journal, generated SQL history
- env or timing questions investigated: whether the issue was tied to PGlite vs dev/test Postgres or to stale local metadata only

## Inputs Reviewed

- code paths reviewed: `package.json` DB scripts, `scripts/db-ops.mjs`, `src/core/db/migrations/config/*.ts`, `src/core/db/migrations/generated/meta/_journal.json`
- logs / diagnostics reviewed: `drizzle-kit generate --help`, `drizzle-kit up --help`, temp-copy generate probes, interactive rename prompt output
- tests / task artifacts reviewed: admin user-management control artifacts, auth foundation handoff notes, authjs phase implementation artifacts

## Actions Performed

- reproduction attempts performed: reproduced the stale baseline behavior in isolated temp copies of the migration folder
- execution-path tracing performed: traced `db:generate` to the shared `src/core/db/migrations/generated` metadata folder used by all DB targets
- source-of-truth tracing performed: compared `_journal.json` entries against actual `meta/*_snapshot.json` files and inspected git history for migrations `0008` through `0011`
- evidence collection performed: validated that a current-schema snapshot baseline makes `drizzle-kit generate` return `No schema changes`

## Symptom Summary

- observed symptom: new `pnpm db:generate` runs attempted to recreate already-applied schema changes from migrations `0008` through `0012`
- where it surfaces: Drizzle migration generation after the admin feature added `0012_users_deactivated_at.sql`
- reproducibility: deterministic
- trigger conditions: any normal generate run after manual SQL migrations were recorded in the journal without matching snapshot files

## Confirmed Evidence

- code facts:
  - `src/core/db/migrations/generated/meta/_journal.json` contains entries through `0012`
  - `src/core/db/migrations/generated/meta/` contained snapshot files only through `0007_snapshot.json`
  - commit history for `0008` through `0011` shows only SQL files plus `_journal.json`, with no snapshot files ever committed
- runtime evidence:
  - `drizzle-kit generate --custom` against the broken chain created a new snapshot based on the stale `0007` baseline, not the current schema
  - transplanting a true current-schema snapshot as the latest entry made a subsequent normal generate return `No schema changes, nothing to migrate`
- diagnostics or logs:
  - temp-copy probe prompted for `auth_tenant_identities` to `auth_organization_identities` rename decisions until a true current-schema latest snapshot was present

## Execution Path

- entry point: `pnpm db:generate`
- critical path: `package.json` -> `drizzle-kit generate --config=src/core/db/migrations/config/drizzle.dev.ts` -> shared migration output folder `src/core/db/migrations/generated`
- state transitions:
  - journal advanced through `0012`
  - snapshot chain remained at `0007`
  - Drizzle diff engine used stale metadata history and re-diffed later schema work
  - reconciliation latest snapshot restored the baseline
- failure boundary: migration metadata, not database runtime state and not per-target DB configuration

## Hypotheses And Failure Points

- likely failure points:
  - manual SQL migrations committed without corresponding snapshot files
  - assumption that separate local DBs needed separate migration metadata caches
- hypotheses:
  - confirmed: broken snapshot lineage caused duplicate migration generation
  - disproven: shared migration folder across PGlite/dev/test/prod was not itself the bug
- disproven possibilities:
  - `drizzle-kit up` as an automatic snapshot repair path
  - `generate --custom` alone as a sufficient reconciliation step

## Missing Evidence / Uncertainty

- what remains unclear: whether the repository should later reconstruct historical snapshots `0008` through `0012` individually for archival completeness
- what evidence would reduce uncertainty fastest: a future controlled test of Drizzle behavior with reconstructed intermediate snapshots
- external dependencies or blockers: none for the current fix

## Artifact Synchronization

- `plan.md` updates: recorded the migration follow-up, Debug Investigation step, and reconciliation completion
- `intake.md` updates: documented root cause and non-cause findings
- `implementation-plan.md` updates: added Phase 8 migration metadata reconciliation checklist
- specialist artifact updates: created this summary and updated `04 - Implementation Agent - Summary.md` and `validation-report.md`

## Handoff Notes

- what the next agent should rely on: the repository now has a latest current-schema reconciliation snapshot at `0013`; `pnpm db:generate` is the authoritative validation check for this issue
- what remains unproven: historical per-step snapshots `0008` through `0012` are still absent
- recommended next specialist or step: no further specialist required unless the team decides to backfill historical snapshots for archival hygiene

## Update Log

### Update Entry

- Date: 2026-04-25
- Trigger: Post-implementation migration generation failure after admin user-management work
- Summary of change: Investigated the duplicate migration generation path, confirmed the missing-snapshot lineage bug, and validated the reconciliation-snapshot repair shape.
- Sections refreshed: all

### Update Entry

- Date: 2026-04-25
- Trigger: Runtime failure after clicking Administration in local AuthJS dev flow
- Summary of change: Confirmed the admin page failure was caused by local dev Postgres drift, not by the admin guard code itself. The active `app_dev` database on `127.0.0.1:5432` reported migrations through `0013` in `drizzle.__drizzle_migrations` but the live `public.users` table still lacked `deactivated_at`. Repaired the local DB with `ALTER TABLE public.users ADD COLUMN IF NOT EXISTS deactivated_at timestamp with time zone` and validated the exact failing `findById` query now succeeds for the affected user ID. Also confirmed the AuthJS sign-in client currently defaults `callbackUrl` to `/`, so bootstrap/onboarding is not guaranteed to run immediately after login unless the request originated from a protected-route redirect.
- Sections refreshed: Symptom Summary, Confirmed Evidence, Handoff Notes, Update Log
