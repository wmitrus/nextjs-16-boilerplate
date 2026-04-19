# Phase 2 — Contract Redesign: Validation Strategy

**Task**: Auth Foundation Redesign — Phase 2  
**Workflow Step**: Validation Strategy  
**Date**: 2026-04-18

---

## Validation Scope

Phase 2 is a pure rename/reshape of contracts and their callers. No new business logic is introduced. The validation gate is TypeScript compilation.

---

## Required Validation

| Check                | Command                 | Threshold                      |
| -------------------- | ----------------------- | ------------------------------ |
| TypeScript typecheck | `pnpm typecheck`        | 0 errors                       |
| Unit tests           | `pnpm test`             | All pass (baseline: 1029/1029) |
| Integration tests    | `pnpm test:integration` | All pass (baseline: 69/69)     |
| Lint                 | `pnpm lint --fix`       | 0 new errors                   |

Run typecheck first (fastest feedback loop on renames). If typecheck passes, run tests.

---

## Optional Validation

- DB integration tests (`pnpm test -- --project=db`): Run if `DrizzleInternalIdentityLookup` or `DrizzleProvisioningService` db tests are touched (they will be, as assertions on `internalOrganizationId` change).

---

## Validation Not Required

- E2E tests (no browser-visible changes)
- Playwright specs (no routing or UI changes)
- Architecture lint / skott check (no module boundary changes)

---

## Validation Gaps

None. TypeScript strict mode + full test suite provides complete coverage of the rename surface.
