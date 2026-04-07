# Validation Strategy — Leantime AI Agent Integration Redesign

**Agent**: 05 - Validation Strategy  
**Task**: Leantime AI Agent Integration Redesign  
**Date**: 2026-04-07  
**Mode**: Change Validation

---

## Task

Validate the redesigned Leantime AI agent integration: new agent definition files,
`retrospectives.*` CLI alias, governing document updates, `AGENTS.md` and
extension system propagation, and production board seeding.

---

## Validation Objective

Confirm that:

1. The `retrospectives.*` CLI alias works correctly against Leantime.
2. TypeScript in `scripts/leantime/` compiles cleanly.
3. Linting passes after all changes.
4. Documentation is internally consistent (no broken references).
5. At least one production Blueprint board and one Retrospective board are seeded.

---

## Current Validation Surfaces

- `pnpm typecheck` — TypeScript check (covers `scripts/` via `tsconfig.json`).
- `pnpm lint --fix` — ESLint flat config.
- `pnpm test` — Vitest unit tests (includes `scripts/**/*.test.ts`).
- `catalog.test.ts` — existing unit tests for Leantime catalog entries.
- `cli.test.ts` — existing unit tests for Leantime CLI.
- Manual `pnpm lt` smoke tests against local Podman stack (`.env.leantime-dev`).
- Manual `pnpm lt` smoke tests against production (`env.leantime`).

---

## Risk Areas

- **CLI alias correctness**: `retrospectives.*` operations must correctly inject
  `boardType=retros` into the delegated `blueprints.*` operations.
- **Catalog test coverage**: New `retrospectives.*` entries should have at least
  basic unit tests following the existing `catalog.test.ts` pattern.
- **Documentation consistency**: All three extension systems must reference the
  same governing document; broken or inconsistent references create silent agent
  misbehavior.
- **Production seeding**: Creating real production board data is irreversible;
  verify against local Podman first.

---

## Validation-Risk Assessment

**Acceptable with gaps.**

The primary risk is the `retrospectives.*` CLI alias correctness. This is
testable with:

1. Unit tests confirming the operation registration and delegation.
2. Smoke test against local Podman stack.
3. Production smoke test (read-only verify) after seeding.

The documentation propagation risk (broken references) is managed by reviewing
all updated files for reference correctness before committing.

---

## Minimum Required Validation

1. **`pnpm typecheck`** — must pass after any TypeScript changes in `scripts/leantime/`.
2. **`pnpm lint --fix`** — must pass after all file changes.
3. **`pnpm test`** — must pass (existing and new tests).
4. **Local Podman smoke test** (`.env.leantime-dev`):
   ```shell
   pnpm lt -- run retrospectives.board.create --input '{"title":"Test Retrospective","projectId":2}' --format=json
   pnpm lt -- run retrospectives.board.list --format=json
   pnpm lt -- run retrospectives.item.create --input '{"boardType":"retros","boardId":<id>,"box":"well","title":"Smoke test item"}' --format=json
   ```
5. **Production seeding smoke test** (`.env.leantime`):
   ```shell
   pnpm lt -- run retrospectives.board.create --input '{"title":"Sprint Retrospective Q2 2026","projectId":2}' --format=json
   pnpm lt -- run blueprints.board.create --input '{"boardType":"value","title":"NextJS Boilerplate Value Canvas","projectId":2}' --format=json
   ```
6. **Documentation reference check**: Manually verify that every updated agent file
   references `LEANTIME_AUTOMATION.md` and that `AGENTS.md` row for agent 10 exists.

---

## Optional Additional Validation

- Add unit tests for `retrospectives.*` catalog entries in `catalog.test.ts`
  following the existing test pattern.
- Run `pnpm lt -- run retrospectives.board.get --input '<id>'` to verify the
  seeded production board is readable.

---

## Validation Not Required

- E2E Playwright tests — no browser-visible behavior changed.
- Integration tests against Next.js runtime — no application code changed.
- Auth flow validation — no auth surface changed.
- Security scan — no sensitive security patterns changed.
- Architecture lint — the `scripts/leantime/` layer is outside architecture lint scope.

---

## Commands / Checks

```shell
pnpm typecheck
pnpm lint --fix
pnpm test
```

Then manual smoke tests:

```shell
# Local Podman
cp .env.leantime-dev .env.leantime.current
pnpm lt -- run retrospectives.board.create --input '{"title":"Test Retro","projectId":2}' --format=json
pnpm lt -- run retrospectives.board.list --format=json

# Production (after local passes)
pnpm lt -- run retrospectives.board.create --input '{"title":"Sprint Retrospective Q2 2026","projectId":2}' --format=json
pnpm lt -- run blueprints.board.create --input '{"boardType":"value","title":"NextJS Boilerplate Value Canvas","projectId":2}' --format=json
```

---

## Validation Gaps

- No automated integration test for Leantime script operations (by design — external API).
- Documentation consistency check is manual.

---

## Recommendation

**Validation plan is minimal but acceptable.**

The task primarily produces documentation and script additions. The key risk
(CLI alias correctness) is validated by smoke tests against both local and
production Leantime. TypeScript and lint checks confirm no regressions in
script code. E2E and integration tests are correctly excluded.

## Recommended Next Action

Proceed to Implementation after this validation strategy is accepted.
