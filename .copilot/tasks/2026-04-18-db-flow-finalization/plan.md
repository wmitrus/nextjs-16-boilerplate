# DB Flow Finalization Plan

## Objective

- Diagnose the full local database script surface and converge on one final, coherent naming and execution model for dev/test/prod workflows.
- Confirm whether the intended universal flow already exists, especially whether migration commands auto-resolve correctly from env or are explicitly target-bound.
- Produce architecture and validation review before making final implementation decisions.

## Scope

- `package.json` DB scripts
- `scripts/db-ops.mjs`
- `scripts/compose-db-local.mjs`
- Drizzle config files under `src/core/db/migrations/config/`
- User-facing DB workflow docs

## Specialist Sequence

- [x] Orchestrator intake and artifact setup
- [x] Architecture Guard review of command taxonomy and target ownership
- [x] Validation Strategy review of minimum proof needed for final cleanup
- [x] Consolidated decision on final naming model and removal/deprecation set
- [x] Implementation of approved final script surface and docs
- [x] Focused validation and final report

## Known Risks

- Script names currently encode mixed concerns: storage backend, environment, and operation target.
- Historical alias names may still appear in archived investigation artifacts, but they are no longer part of the active public command surface.
- The desired "universal" env-driven behavior may conflict with safety guardrails that intentionally bind commands to dev/test targets.

## Artifacts

- [x] `plan.md`
- [x] `intake.md`
- [x] `01 - Architecture Guard - Summary.md`
- [x] `05 - Validation Strategy - Summary.md`
- [x] `constraints.md`
- [x] `implementation-plan.md`
- [x] `04 - Implementation Agent - Summary.md`
- [x] `validation-report.md`

## Final Decision

- Final public model is explicit by target: `db:pglite:*`, `db:dev:*`, `db:test:*`.
- The repo does not treat public local migration as one universal env-driven command across PGlite and Postgres.
- Deprecated compatibility aliases were removed after confirming they are no longer used by active repo code or documentation.
- `db:migrate:cli` was removed from `package.json` because it was non-canonical and bypassed the explicit public taxonomy.
