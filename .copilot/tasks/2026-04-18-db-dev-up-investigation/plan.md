# DB Dev Up Investigation

## Task ID

`2026-04-18-db-dev-up-investigation`

## Objective

Determine why `pnpm db:dev:up` is perceived as failing, identify the exact failure boundary, and separate command-wrapper issues from downstream database schema/runtime issues.

## Status

- [x] Read repository debug-investigation guidance
- [x] Inspect task artifact requirements
- [x] Reproduce `pnpm db:dev:up` and capture command evidence
- [x] Inspect compose command selection and container state
- [x] Inspect database readiness versus schema/migration state
- [x] Confirm whether the failure is the startup command or downstream app/database usage
- [x] Record findings in specialist summary

## Expected Specialist Sequence

1. Debug Investigation

## Known Risks / Unknowns

- The local shell history showed `pnpm db:dev:up` last exited `0`; investigation confirmed the visible error is non-fatal Podman noise during restart of an existing container.
- The working tree is dirty; unrelated auth-foundation changes include new DB migrations and schema updates.
- The app does fail against the current dev DB because recent auth-foundation schema changes are not applied there.

## Artifact List

- `plan.md`
- `intake.md`
- `06 - Debug Investigation - Summary.md`
