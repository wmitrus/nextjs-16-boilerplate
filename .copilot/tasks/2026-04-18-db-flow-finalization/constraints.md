# DB Flow Finalization Constraints

## Confirmed Constraints

- Public local Postgres commands must remain target-explicit and guarded.
- `db:migrate:dev` is PGlite-oriented, not a universal migrate command.
- `db:test:*` is a separate test-only family and must not be conflated with app dev flows.
- Deprecated aliases may remain temporarily, but must not stay documented as canonical.
- Prod migration contract must remain explicit and CI-safe.

## Design Guardrails

- Prefer one coherent naming convention over mixed historical names.
- Do not make destructive Postgres operations depend on ambient env alone without explicit rejection rules.
- If a command is backend-specific, its name should say so.
- If a command is only a compatibility alias, it should warn and be clearly marked for future removal.

## Finalization Target

- Canonical families should be easy to scan and unambiguous by target.
- User-facing docs should describe one primary local dev path and clearly separated opt-in alternatives.
