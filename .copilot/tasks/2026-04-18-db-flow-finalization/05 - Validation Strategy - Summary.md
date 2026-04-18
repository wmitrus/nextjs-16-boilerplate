# 05 - Validation Strategy - Summary

## Task Context

- Task ID: `2026-04-18-db-flow-finalization`
- Task Objective: determine the minimum safe validation needed before finalizing the DB script taxonomy, including alias keep/deprecate/remove decisions and whether any universal env-driven wrapper should exist
- Current Run Scope: `package.json` DB scripts, `scripts/db-ops.mjs`, `scripts/compose-db-local.mjs`, `scripts/lib/db-guard.mjs`, Drizzle migration configs, and user-facing DB workflow docs
- Mode: CHANGE VALIDATION
- Status: COMPLETED
- Last Updated: 2026-04-18
- Related Control Artifacts: `plan.md`, `intake.md`

## Scope Handled

- change surfaces assessed: package-level DB command taxonomy, guarded dev/test Postgres wrapper behavior, PGlite vs Postgres migration config split, and repository docs that advertise those flows
- validation questions in scope: what proof is required to keep aliases, deprecate aliases, remove aliases, or introduce a universal env-driven wrapper without creating false confidence
- excluded validation areas: app runtime behavior unrelated to script entrypoints, Drizzle repository behavior, E2E auth/bootstrap flows, and broad CI posture changes unrelated to DB command finalization

## Inputs Reviewed

- code paths reviewed:
  - `package.json`
  - `scripts/db-ops.mjs`
  - `scripts/compose-db-local.mjs`
  - `scripts/lib/db-guard.mjs`
  - `src/core/db/migrations/config/drizzle.dev.ts`
  - `src/core/db/migrations/config/drizzle.dev.postgres.ts`
  - `src/core/db/migrations/config/drizzle.test.ts`
  - `src/core/db/migrations/config/drizzle.prod.ts`
  - `src/app/auth/bootstrap/bootstrap-error.tsx`
  - `src/app/auth/bootstrap/bootstrap-error.test.tsx`
- tests / configs / workflows reviewed:
  - `vitest.unit.config.ts`
  - `vitest.db.config.ts`
  - `vitest.db.local.config.ts`
  - `.github/workflows/pr-validation.yml`
  - `.github/workflows/preview-deploy.yml`
  - `.github/workflows/prod-deploy.yml`
- earlier task artifacts reviewed:
  - `../2026-04-18-db-dev-up-investigation/06 - Debug Investigation - Summary.md`
- user-facing docs reviewed:
  - `README.md`
  - `docs/local-db.md`
  - `docs/usage/03 - Testing Usage & DB Workflows.md`
  - `docs/architecture/Enterprise-Ready DB layer/09 - MIGRATION FLOW (PROFESSIONAL).md`

## Actions Performed

- validation posture review performed: compared live script behavior, migration config semantics, workflow usage, and docs references
- risk analysis performed: separated low-risk alias cleanup from higher-risk wrapper/target-resolution changes
- test-level recommendations prepared: identified where command-level smoke proof is enough and where targeted script tests become the minimum sensible floor
- command recommendations prepared: defined proof requirements for canonical commands, deprecated aliases, and any proposed universal wrapper branch

## Current-State Findings

- Confirmed:
  - the live repository already uses an explicit split between PGlite dev commands (`db:migrate:dev`, `db:studio`, `db:seed`, `db:reset:pglite`) and guarded Postgres commands (`db:dev:*`, `db:test:*`, `db:migrate:prod`)
  - `scripts/db-ops.mjs` only supports `dev` and `test` Postgres targets; destructive operations route through `scripts/lib/db-guard.mjs`
  - `drizzle.dev.ts` intentionally resolves to PGlite and falls back away from Postgres URLs, while `drizzle.dev.postgres.ts`, `drizzle.test.ts`, and `drizzle.prod.ts` require Postgres URLs
  - `scripts/compose-db-local.mjs` is a compose launcher with engine/file selection, not a database target resolver
  - deprecated aliases are already documented as deprecated in `README.md`, `docs/local-db.md`, and `docs/usage/03 - Testing Usage & DB Workflows.md`
  - production deployment still relies on the explicit `db:migrate:prod` path in `.github/workflows/prod-deploy.yml`
- Risks:
  - the repository does not currently have direct automated tests for `package.json` DB aliases, `scripts/db-ops.mjs`, or `scripts/compose-db-local.mjs`; confidence today comes from code inspection, docs alignment, and prior manual evidence
  - removing or renaming aliases without a repo-wide reference audit will leave stale user-facing guidance and support copy behind
  - a universal env-driven wrapper would collapse currently separate safety contracts across PGlite, dev Postgres, test Postgres, and prod migration flows; that is materially riskier than alias cleanup
  - DB repository suites (`*.db.test.ts`) validate persistence behavior, not CLI script taxonomy or guard/dispatch semantics
- Drift:
  - current live docs align on `db:local:*` / `db:migrate:local` being deprecated test-DB aliases, so there is no immediate docs-vs-code drift on alias status
  - older generic runbooks still emphasize `db:migrate:dev` and `db:seed` for local setup; that is valid for PGlite, but it is not proof that a universal Postgres wrapper should exist

## Validation-Risk Assessment

- primary risks:
  - dev/test target guard regression could let the wrong command mutate the wrong Postgres database
  - alias removal could silently break repository-owned docs and user-facing remediation text
  - a universal wrapper could create ambiguous resolution between PGlite, local dev Postgres, local test Postgres, and production migration paths
  - prod migration ergonomics could regress if the explicit `db:migrate:prod` deployment contract is weakened or hidden behind local-file assumptions
- confidence gaps:
  - no live script-level automated tests cover engine selection, URL resolution, guard failures, or alias delegation
  - PR validation does not execute DB script entrypoints; it only runs lint, typecheck, unit tests, env check, and architecture/dependency gates
  - repository evidence cannot prove whether external users still depend on deprecated aliases; only repository-owned references can be closed with certainty
- over-validation or under-validation concerns:
  - broad app tests (`pnpm test`, `pnpm test:integration`, `pnpm e2e`) are poor evidence for CLI taxonomy changes unless app/runtime code also changes
  - relying only on DB adapter suites would create false confidence because they bypass the script surface entirely
  - if only alias wiring/docs change, adding broad new test suites would be wasteful; if wrapper semantics change, refusing targeted script tests would under-validate the actual risk

## Recommended Validation Scope

- minimum required validation:
  - for keep/deprecate/remove alias decisions, perform a repository-owned reference audit and update every live reference to the affected commands in `README.md`, `docs/local-db.md`, `docs/usage/03 - Testing Usage & DB Workflows.md`, any other live docs, and user-facing copy such as `src/app/auth/bootstrap/bootstrap-error.tsx` if touched
  - if aliases are kept as deprecated, prove both conditions: `package.json` still delegates them to the canonical command with a deprecation warning, and all live docs describe them as deprecated rather than canonical
  - if aliases are removed, prove there are zero remaining repository-owned references to the removed names after the doc/code patch; this is the minimum safe in-repo evidence before removal
  - if only `package.json` script wiring changes with no logic changes in `scripts/db-ops.mjs` or `scripts/compose-db-local.mjs`, minimum proof is targeted command-surface smoke validation of each changed canonical command and each retained deprecated alias
  - if `scripts/db-ops.mjs`, `scripts/compose-db-local.mjs`, or target-resolution semantics change, add targeted script-level automated tests under `scripts/**/*.test.ts` as the minimum safe floor because the risk surface is branching and guard logic, not Drizzle repository behavior
  - if a universal env-driven wrapper is proposed, require branch-specific proof for all four semantics before approval: PGlite default resolution, dev Postgres targeting, test Postgres targeting, and prod migration isolation; a wrapper that guesses among these modes without explicit rejection paths is under-validated by definition
  - any universal wrapper proposal should keep `db:migrate:prod` explicit or prove an equally explicit production-only contract remains intact in deployment workflows; otherwise validation is insufficient
- optional additional validation:
  - add or run focused unit tests for `scripts/db-ops.mjs` covering `resolveUrl()`, invalid target/operation handling, guard invocation, and `test` target fallback when `DATABASE_URL` is non-Postgres
  - add or run focused unit tests for `scripts/compose-db-local.mjs` covering engine selection (`podman|docker|auto`), explicit compose file confinement, and missing compose file failure paths
  - run one operator-level smoke with `DB_COMPOSE_ENGINE=docker` or explicit `DB_COMPOSE_FILE=podman-compose.yml` if compose selection behavior changes
  - run one local prod-operator dry run for `db:migrate:prod:local` only if production-local migration semantics or docs are changed
  - if the final decision materially changes the public operator model, update docs beyond the three primary DB workflow docs so legacy runbooks do not contradict the new taxonomy
- validation explicitly not required:
  - `pnpm test:db`, `pnpm test:db:ci`, and `pnpm test:db:local` when only CLI names/docs/alias delegation change and no Drizzle repository, schema, or seed behavior changes
  - Playwright E2E coverage, because the question is CLI taxonomy and migration/operator safety rather than browser behavior
  - broad unit/integration suite runs (`pnpm test`, `pnpm test:integration`) unless the implementation also touches application code such as bootstrap error handling or env/runtime logic outside the scripts
  - executing real production migrations against a live environment
  - broad CI workflow revalidation when `db:migrate:prod` semantics and deployment workflow contracts remain unchanged

## Validation Commands / Checks

- commands to run:
  - `rg -n "db:local:up|db:local:down|db:migrate:local|db:studio:local|db:migrate:dev:postgres|db:dev:migrate|db:test:migrate|db:migrate:dev" README.md docs src .github package.json`
  - `pnpm db:dev:migrate`
  - `pnpm db:test:migrate`
  - `pnpm db:local:up && pnpm db:local:down` only if deprecated aliases are intentionally retained
  - focused `vitest` invocation for any new `scripts/**/*.test.ts` added for wrapper logic
- environment prerequisites:
  - local operator smoke for `db:dev:*` requires the local dev container profile
  - local operator smoke for `db:test:*` and any retained `db:local:*` aliases requires the local test container profile
  - wrapper-engine validation with Docker requires Docker compose tooling installed if `DB_COMPOSE_ENGINE=docker` is exercised
  - prod-local dry run requires a safe local `.env.production` context and should never target a real deployment by accident
- expected evidence:
  - changed commands resolve to the intended canonical target and guard contract
  - removed aliases have zero remaining repository-owned references
  - retained aliases warn and delegate correctly
  - wrapper behavior rejects ambiguous or unsafe env combinations instead of silently choosing a target
  - deployment-owned `db:migrate:prod` behavior remains explicit and unchanged unless intentionally redesigned

## Artifact Synchronization

- `plan.md` updates: marked Validation Strategy review complete and artifact present
- `intake.md` updates: marked validation review captured
- `implementation-plan.md` updates: not applicable in this run
- specialist artifact updates: created `05 - Validation Strategy - Summary.md`

## Open Questions / Blockers

- unresolved questions:
  - whether the final architecture decision will keep the current explicit target taxonomy or introduce a universal wrapper branch that must prove safe resolution rules
  - whether the repository wants to preserve deprecated aliases for one more release purely for external operator compatibility
- blockers:
  - none for alias cleanup validation planning
- dependencies on architecture / security / runtime decisions:
  - deciding that a universal env-driven wrapper should exist is not a pure validation choice; it depends on Architecture Guard and Next.js/runtime/operator constraints because the current model is intentionally target-bound

## Handoff Notes

- what the next agent should rely on:
  - alias cleanup and docs cleanup can be validated with focused command-surface proof; they do not justify broad application test expansion
  - introducing a universal wrapper is a separate, higher-risk branch that needs targeted script tests and explicit proof that prod migration semantics remain isolated
  - DB adapter `*.db.test.ts` suites are not the right evidence for CLI taxonomy changes
- what should not be re-decided without new evidence:
  - do not assume `db:migrate:dev` is a universal Postgres command; the live config split contradicts that
  - do not treat repository docs alone as proof that a universal wrapper is safe; the code guardrails are the source of truth
- recommended next specialist or step:
  - Architecture Guard should decide whether the final model remains explicit-target only or whether a universal wrapper is even allowed; implementation should then follow the validation branch above

## Update Log

### Update Entry

- Date: 2026-04-18
- Trigger: task request for minimum safe validation scope before finalizing DB script taxonomy
- Summary of change: reviewed the live DB script surface, migration configs, workflow contracts, and docs; defined minimum validation for alias keep/deprecate/remove decisions and for any potential universal wrapper proposal
- Sections refreshed: all
