# 06 - Debug Investigation - Summary

## Task Context

- Task ID: `2026-04-18-db-dev-up-investigation`
- Task Objective: Determine whether `pnpm db:dev:up` itself fails and identify the real failure boundary.
- Current Run Scope: local DB startup wrapper, compose selection, container state, DB readiness
- Status: COMPLETED
- Last Updated: 2026-04-18
- Related Control Artifacts: `plan.md`, `intake.md`

## Scope Handled

- symptom or flow investigated: `pnpm db:dev:up` perceived as failing; verified startup path versus downstream schema failure
- runtime surfaces investigated: `package.json`, `scripts/compose-db-local.mjs`, `scripts/db-ops.mjs`, `podman-compose.yml`
- env or timing questions investigated: command wrapper, compose-engine selection logic, existing-container restart path

## Inputs Reviewed

- code paths reviewed:
  - `package.json`
  - `scripts/compose-db-local.mjs`
  - `scripts/db-ops.mjs`
  - `podman-compose.yml`
- logs / diagnostics reviewed:
  - active terminal context showing previous `pnpm db:dev:up` exit code `0`
  - live `pnpm db:dev:up` terminal output showing Podman name-collision error followed by successful `podman start`
  - `logs/server.log` provisioning failure against missing `organizations` table
- tests / task artifacts reviewed:
  - none

## Actions Performed

- reproduction attempts performed:
  - reran `pnpm db:dev:up`
  - checked running container state with Podman
  - queried the dev database for expected schema objects
- execution-path tracing performed:
  - confirmed `pnpm db:dev:up` delegates to `node scripts/compose-db-local.mjs up -d dev-db`
  - confirmed wrapper auto-selects Podman first by default, then Docker
  - confirmed compose target is `dev-db` from `podman-compose.yml`
- source-of-truth tracing performed:
  - confirmed container startup is separate from migrations and seeding
- evidence collection performed: complete for the current failure report

## Symptom Summary

- observed symptom: terminal shows an error during `pnpm db:dev:up`, and the app later fails in provisioning/bootstrap
- where it surfaces: local dev database startup output and later app requests against the dev DB
- reproducibility: deterministic on a machine where `nextjs16_dev_db` already exists and the dev schema is behind current code
- trigger conditions:
  - existing Podman container named `nextjs16_dev_db`
  - dev database missing recent auth-foundation migrations

## Confirmed Evidence

- code facts:
  - `db:dev:up` only starts the `dev-db` container; it does not migrate or seed the DB
  - the wrapper exits with the compose command status directly
  - current provisioning code in single-tenant mode queries `organizations` by `tenantId`
- runtime evidence:
  - `pnpm db:dev:up` exits `0`
  - Podman reports `nextjs16_dev_db` already exists, then successfully runs `podman start nextjs16_dev_db`
  - the container is already `Up ... (healthy)`
  - the running DB accepts connections
  - the running DB contains `tenants` but does not contain `organizations`
  - the `memberships.organization_id` column is absent (`0` matching columns)
- diagnostics or logs:
  - application logs show provisioning failing on `select "id", "tenant_id" from "organizations" ...`

## Execution Path

- entry point: `package.json` script `db:dev:up`
- critical path: `package.json` -> `scripts/compose-db-local.mjs` -> compose binary selection -> `podman-compose.yml` service `dev-db`
- state transitions: container create/start only; no schema transition performed by this command
- failure boundary:
  - visible startup error boundary: Podman create attempt on an already-existing container name
  - real runtime failure boundary: app code expects the post-auth-foundation schema, but the dev DB still has the pre-migration schema

## Hypotheses And Failure Points

- likely failure points:
  - benign Podman create path when the container already exists
  - downstream app queries fail because migrations were not applied
- hypotheses:
  - the reported failure is a combination of misleading startup noise and a real unmigrated-schema failure later in the app flow
- disproven possibilities:
  - `pnpm db:dev:up` does not currently fail with a non-zero exit code
  - the dev DB is not down; it is running and healthy

## Missing Evidence / Uncertainty

- what remains unclear:
  - whether the user wants the noisy startup path fixed or only the root cause explained
- what evidence would reduce uncertainty fastest:
  - running `pnpm db:dev:migrate` and rechecking the app flow
- external dependencies or blockers:
  - none

## Artifact Synchronization

- `plan.md` updates: created and initialized
- `intake.md` updates: created and initialized
- `implementation-plan.md` updates: not applicable
- specialist artifact updates: initial summary created

## Handoff Notes

- what the next agent should rely on:
  - `db:dev:up` itself succeeds; do not treat the Podman create error as the root issue
  - current code expects the `organizations` schema introduced by the auth-foundation redesign
- what remains unproven:
  - whether the user wants the startup wrapper made idempotent/quiet
- recommended next specialist or step:
  - if the user wants remediation, run `pnpm db:dev:migrate` first; if they want the noisy startup behavior removed, patch the compose wrapper or service lifecycle command next

## Update Log

### Update Entry

- Date: 2026-04-18
- Trigger: runtime reproduction and schema verification
- Summary of change: confirmed non-fatal Podman name-collision output, verified healthy container, and traced the real app failure to missing auth-foundation schema changes in the dev DB
- Sections refreshed: all
