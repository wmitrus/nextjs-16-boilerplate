# Intake

## Objective

Validate why `pnpm db:dev:up` fails.

## Requirements

- Reproduce or verify the reported failure.
- Trace the command path used by `pnpm db:dev:up`.
- Identify whether the failure is in compose startup, container health, or later DB usage.

## Scope

- Local DB startup path only.
- Supporting scripts, compose files, container status, and immediate DB readiness.

## Non-Goals

- Implementing schema fixes unless the user asks for a fix.
- Broad auth-foundation remediation.

## Acceptance Criteria

- The exact failing step is identified or the report is disproven with evidence.
- The result distinguishes startup success from downstream migration/schema failures.

## References

- `package.json`
- `scripts/compose-db-local.mjs`
- `scripts/db-ops.mjs`
- `podman-compose.yml`

## Environment Assumptions

- Linux workstation
- Repository root: `/home/wojtek/projects/nextjs-16-boilerplate`
- Current branch: `main`

## Readiness Checklist

- [x] Relevant repo instructions loaded
- [x] Startup wrapper inspected
- [x] Runtime evidence captured
- [x] Failure boundary confirmed
