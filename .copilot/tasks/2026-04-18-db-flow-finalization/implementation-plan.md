# DB Flow Finalization Implementation Plan

## Final Design Decision

- Canonical explicit families:
  - `db:pglite:*`
  - `db:dev:*`
  - `db:test:*`
- Removed from public surface:
  - `db:migrate:dev`
  - `db:seed`
  - `db:studio`
  - `db:reset:pglite`
  - `db:migrate:dev:postgres`
  - `db:local:up`
  - `db:local:down`
  - `db:migrate:local`
  - `db:studio:local`
  - `db:migrate:cli`

## Steps

- [x] Add canonical `db:pglite:*` scripts in `package.json`
- [x] Convert old PGlite names into deprecation aliases
- [x] Remove `db:migrate:cli` from `package.json`
- [x] Update internal repo scripts to use canonical `db:pglite:*`
- [x] Update user-facing docs to use canonical `db:pglite:*`
- [x] Record removal candidates and rationale in final artifacts
- [x] Run focused validation

## Cleanup Outcome

- Deprecated alias scripts were removed after repository-wide usage audit of active code and docs.
- Historical mentions remain only in archived task/chat artifacts and do not affect runtime or operator workflows.
