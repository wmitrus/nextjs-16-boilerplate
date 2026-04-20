# DB Flow Finalization Intake

## User Objective

Finalize and professionalize the DB script surface in `package.json` and related flow docs.

## User Requirements

- Diagnose the full DB script flow end-to-end.
- Confirm whether the intended final model was supposed to be universal and env-driven.
- Keep `db:dev:*` naming if it remains the right convention.
- Distinguish explicitly-targeted scripts for concrete backends/environments from generic flow commands.
- Identify duplicated, redundant, or misleading scripts and mark candidates for removal.
- Do architecture/design/validation review first, then make the final decision.

## Current Hypotheses To Confirm

- `db:migrate:dev` is PGlite-only and not universal.
- `db:dev:*` is dev Postgres container only.
- `db:test:*` is test Postgres container only.
- `db:local:*` and `db:migrate:local` are legacy aliases to test Postgres commands.
- Safety guards intentionally prevent a single env-blind command from mutating the wrong Postgres target.

## Non-Goals

- Broad DB architecture rewrite.
- Changing runtime DB selection for the app unless required by the final script design.
- Touching CI/prod migration behavior unless the diagnosis shows naming drift or unsafe semantics.

## Acceptance Criteria

- There is one clear command taxonomy with justified naming.
- The repo explicitly documents which commands are universal, backend-specific, or deprecated.
- Redundant or misleading commands are classified as keep/deprecate/remove.
- Architecture and validation reviews are recorded before final implementation.

## Source Files

- `package.json`
- `scripts/db-ops.mjs`
- `scripts/compose-db-local.mjs`
- `scripts/lib/db-guard.mjs`
- `src/core/db/migrations/config/drizzle.dev.ts`
- `src/core/db/migrations/config/drizzle.dev.postgres.ts`
- `src/core/db/migrations/config/drizzle.test.ts`
- `src/core/db/migrations/config/drizzle.prod.ts`
- `README.md`
- `docs/local-db.md`
- `docs/usage/03 - Testing Usage & DB Workflows.md`

## Readiness Checklist

- [x] Task workspace created
- [x] Objective normalized
- [x] Architecture review captured
- [x] Validation review captured
- [x] Final decision recorded
- [x] Implementation completed
- [x] Validation evidence captured
