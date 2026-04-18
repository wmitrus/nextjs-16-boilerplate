# 01 - Architecture Guard - Summary

## Task Context

- Task ID: `2026-04-18-db-flow-finalization`
- Task Objective: review the local DB command taxonomy and recommend the final public script surface for PGlite, dev Postgres, test Postgres, and deprecated aliases
- Current Run Scope: command ownership, target clarity, backend split, docs-vs-code drift, final naming recommendation
- Status: COMPLETED
- Last Updated: 2026-04-18
- Related Control Artifacts: `plan.md`, `intake.md`

## Scope Handled

- modules / layers reviewed:
  - local developer command surface in `package.json`
  - DB operation wrappers in `scripts/db-ops.mjs`, `scripts/compose-db-local.mjs`, `scripts/lib/db-guard.mjs`
  - Drizzle migration configs under `src/core/db/migrations/config/`
- change surface reviewed:
  - PGlite commands: `db:migrate:dev`, `db:seed`, `db:studio`, `db:reset:pglite`
  - dev Postgres commands: `db:dev:*`
  - test Postgres commands: `db:test:*`
  - deprecated aliases: `db:local:*`, `db:migrate:local`, `db:studio:local`, `db:migrate:dev:postgres`
  - hidden env-driven migrate path: `db:migrate:cli`
- architecture questions in scope:
  - whether a single env-driven universal migrate command should become the public local workflow
  - whether the current explicit-target split is architecturally coherent
  - what the final naming convention should be

## Inputs Reviewed

- code paths reviewed:
  - `package.json`
  - `scripts/db-ops.mjs`
  - `scripts/compose-db-local.mjs`
  - `scripts/lib/db-guard.mjs`
  - `scripts/db-seed.ts`
  - `scripts/reset-pglite.mjs`
  - `src/core/db/migrate-cli.ts`
  - `src/core/db/migrations/run-migrations.ts`
  - `src/core/db/migrations/config/drizzle.dev.ts`
  - `src/core/db/migrations/config/drizzle.dev.postgres.ts`
  - `src/core/db/migrations/config/drizzle.test.ts`
  - `src/core/db/migrations/config/drizzle.prod.ts`
- docs / ADRs / prompts reviewed:
  - `docs/local-db.md`
  - `docs/usage/03 - Testing Usage & DB Workflows.md`
  - `README.md`
  - `docs/architecture/Enterprise-Ready DB layer/09 - MIGRATION FLOW (PROFESSIONAL).md`
  - `docs/architecture/Enterprise-Ready DB layer/README.md`
- earlier task artifacts reviewed:
  - `plan.md`
  - `intake.md`

## Actions Performed

- repository inspection performed:
  - mapped script families to underlying executors and Drizzle configs
  - compared public scripts to the actual guard and URL-resolution behavior
- boundary checks performed:
  - verified which commands are backend-bound versus env-driven
  - verified where destructive Postgres operations are protected by explicit target guards
- dependency / DI review performed:
  - not a DI-heavy task; focus stayed on command ownership and operational boundaries
- docs-vs-code checks performed:
  - compared docs language for PGlite-default flows against actual script behavior
  - checked whether deprecated aliases are still documented as deprecated rather than canonical

## Current-State Findings

- Confirmed:
  - `db:migrate:dev` is PGlite-oriented, not universal. It calls `drizzle.dev.ts`, and that config deliberately falls back to the PGlite path when `DATABASE_URL` is a Postgres URL, so it cannot safely serve as a shared migrate entrypoint for Postgres and PGlite.
  - `db:dev:*` and `db:test:*` are explicit-target Postgres workflows backed by `scripts/db-ops.mjs`, which resolves a target first and then enforces target-specific guards through `guardDevOperation()` and `guardTestOperation()` before `migrate`, `seed`, or `reset` run.
  - `db:local:*` and `db:migrate:local` are legacy aliases to the test Postgres workflow and are already positioned as deprecated in both code and docs.
  - `db:migrate:dev:postgres` is already reduced to a deprecated alias that forwards to `db:dev:migrate`, which is the correct direction.
  - `db:migrate:cli` exists as a real env-driven universal migration path via `src/core/db/migrate-cli.ts`, but it is not part of the documented public local taxonomy and it bypasses the target-specific Postgres guard model.
- Risks:
  - A public “one migrate command for everything” would collapse distinct safety boundaries. The current Postgres wrappers intentionally encode target ownership (`dev` vs `test`) and validate the target URL before mutation; an env-driven universal local command would make the operator responsible for remembering the active env and would materially increase wrong-target risk.
  - `db:seed` is the main taxonomy asymmetry. The docs present it as the default PGlite seed command, but `scripts/db-seed.ts` is actually env-driven: it seeds Postgres when `DB_DRIVER=postgres` or `NODE_ENV=production`, and requires only `DATABASE_URL` for that path. Publicly treating `db:seed` as purely PGlite is therefore an oversimplification.
  - `db:migrate:cli` and `db:seed` together prove the repo does have env-driven generic mechanics, but they are better understood as implementation utilities or escape hatches than as the primary public operator surface.
- Drift:
  - Docs consistently describe `db:migrate:dev`, `db:seed`, and `db:studio` as the PGlite default flow, but only `db:migrate:dev` and `db:studio` are effectively pinned to the PGlite config. `db:seed` is not equivalently pinned.
  - The architecture docs and README generally explain the explicit Postgres split well, but they do not surface the existence or intended non-public status of `db:migrate:cli`.

## Boundary And Dependency Assessment

- module ownership assessment:
  - `package.json` owns the public command taxonomy.
  - `scripts/db-ops.mjs` owns explicit-target Postgres mutation behavior.
  - `scripts/lib/db-guard.mjs` owns target validation for local Postgres mutations.
  - Drizzle config files own backend-specific migration routing.
- dependency direction assessment:
  - The split is clean: thin package scripts delegate to wrappers, wrappers delegate to guarded target resolution or backend-specific configs.
  - There is no architectural pressure to unify these layers further; the existing split maps to real operational distinctions.
- DI / composition assessment:
  - not materially applicable here
- cross-module coupling assessment:
  - low. The command taxonomy is centralized rather than scattered.
  - the only meaningful coupling issue is semantic, not structural: the generic name `db:seed` does more than the docs imply.

## Architectural Decisions / Constraints

- approved architectural constraints:
  - Keep the explicit-target model as the final public local Postgres shape.
  - Treat PGlite defaults and Postgres targets as different operator modes, not as one abstract “local DB” mode.
  - Preserve target-bearing verbs for any destructive or stateful Postgres operation: `migrate`, `seed`, `reset`, `studio`.
  - If a universal env-driven command remains in the repo, keep it internal or advanced-use only; do not elevate it to the main documented local workflow.
- rejected directions:
  - Reject a single public env-driven migrate command across PGlite and Postgres as the primary final shape. It would weaken target clarity and discard the safety guard semantics already encoded in `db:dev:*` and `db:test:*`.
  - Reject reviving `db:local:*` as a generic family. `local` is ambiguous because the repository now has multiple distinct local targets.
- follow-up architectural guardrails:
  - The public naming convention should express target first for Postgres and backend-default only for the PGlite convenience path.
  - Either rename `db:seed` to an explicitly PGlite/default-scoped name or document very clearly that it is a default env-driven seed command whose canonical everyday use is PGlite. From an architecture-clarity perspective, the cleaner end state is explicit naming.

## Artifact Synchronization

- `plan.md` updates:
  - mark Architecture Guard review complete
- `intake.md` updates:
  - mark Architecture review captured complete
- `implementation-plan.md` updates:
  - not created in this run
- specialist artifact updates:
  - created `01 - Architecture Guard - Summary.md`

## Open Questions / Blockers

- unresolved questions:
  - whether the implementation step wants to normalize the generic PGlite/default family to fully explicit names, for example `db:pglite:migrate`, `db:pglite:seed`, `db:pglite:studio`, with current short names preserved temporarily as deprecated convenience aliases
  - whether `db:migrate:cli` should remain callable from `package.json` or be demoted to an undocumented script entry used only by advanced/internal workflows
- blockers:
  - none for the architectural verdict
- evidence still needed:
  - Validation Strategy should decide the minimum proof for any rename/removal work, especially if deprecated aliases are removed in the same change

## Handoff Notes

- what the next agent should rely on:
  - The command surface is already architecturally coherent around two principles:
    - default convenience commands for PGlite
    - explicit target-bound commands for local Postgres
  - The final model should not introduce a universal env-blind local migrate command across PGlite and Postgres.
  - The main remaining cleanup is semantic consistency, especially around `db:seed` and how visible `db:migrate:cli` should be.
- what should not be re-decided without new evidence:
  - Do not re-open the explicit-target safety model for Postgres unless there is a new operational constraint that the current guards cannot satisfy.
- recommended next specialist or step:
  - `05 - Validation Strategy` should review the minimum safe validation for any final cleanup.
  - Implementation can then finalize names and deprecations under the explicit-target model.

## Recommended Final Public Naming Convention

- Keep:
  - PGlite/default family:
    - `db:migrate:dev`
    - `db:studio`
    - `db:reset:pglite`
  - Dev Postgres family:
    - `db:dev:up`
    - `db:dev:down`
    - `db:dev:migrate`
    - `db:dev:seed`
    - `db:dev:studio`
    - `db:dev:reset`
  - Test Postgres family:
    - `db:test:up`
    - `db:test:down`
    - `db:test:migrate`
    - `db:test:seed`
    - `db:test:studio`
    - `db:test:reset`
  - Shared lifecycle helper:
    - `db:all:down`
- Deprecate then remove:
  - `db:migrate:dev:postgres`
  - `db:local:up`
  - `db:local:down`
  - `db:migrate:local`
  - `db:studio:local`
- Internal / advanced only:
  - `db:migrate:cli` should remain non-canonical and undocumented unless there is a specific advanced workflow that truly needs it.
- Recommended naming refinement:
  - Best final clarity: make the default seed command explicit, for example `db:seed:dev` or preferably `db:pglite:seed`, then optionally retain `db:seed` as a deprecated alias for one transition cycle.
  - If the repo chooses not to rename `db:seed`, docs must stop describing it as strictly PGlite-scoped and instead call it the default local seed command whose normal path is PGlite.

## Architecture Verdict

- Safe final shape: explicit-target model
- Not recommended: single env-driven universal migrate command as the main local interface
- Overall assessment: the current split is architecturally coherent and should be preserved, with cleanup focused on deprecated aliases and the remaining generic-name drift

## Update Log

### Update Entry

- Date: 2026-04-18
- Trigger: architecture review request for DB command taxonomy finalization
- Summary of change: confirmed the explicit-target local Postgres model is the correct final public shape; rejected a universal public migrate command across PGlite and Postgres; identified `db:seed` and `db:migrate:cli` as the remaining semantic cleanup points
- Sections refreshed: all
