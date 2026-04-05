# Validation Report: Per-Request DI Container Caching + New Relic

**Task ID**: `2026-04-05-per-request-caching`
**Status**: ✅ Complete
**Date**: 2026-04-05

---

## Current State

The implementation is present in repository code, including the browser follow-up path, and fresh rerun evidence has been captured for the final state.

## Commands Executed

```bash
pnpm typecheck
pnpm lint --fix
pnpm test -- --reporter=verbose src/core/runtime/bootstrap.test.ts
pnpm test -- --reporter=verbose src/core/
```

---

## Results

### Typecheck

`pnpm typecheck` passed with zero errors.

### Lint

`pnpm lint --fix` completed with zero errors and 4 documented pre-existing warnings.

### Unit Tests — Bootstrap Specific

`pnpm test -- --reporter=verbose src/core/runtime/bootstrap.test.ts` passed. In this Vitest project configuration the command executed the full unit suite and all 133 files / 900 tests passed, including the bootstrap coverage.

### Unit Tests — Full Suite

`pnpm test -- --reporter=verbose src/core/` passed with 133 files / 900 tests passing.

---

## Feature Behavior Verification

| Invariant                                                           | Verification Method                                             | Status |
| ------------------------------------------------------------------- | --------------------------------------------------------------- | ------ |
| Same Container instance per RSC render pass                         | Covered by `src/core/runtime/bootstrap.test.ts` and rerun       | ✅     |
| Fresh Container per new request                                     | Covered by `src/core/runtime/bootstrap.test.ts` and rerun       | ✅     |
| Child container resolves through parent                             | Covered by `src/core/runtime/bootstrap.test.ts` and rerun       | ✅     |
| New Relic facade no-ops gracefully when disabled                    | Covered by rerun suite                                          | ✅     |
| Browser snippet resolution handles wrapper/base64/dotenv truncation | Covered by `src/core/observability/new-relic.test.ts` and rerun | ✅     |
| `newrelic.js` config gated on license key presence                  | Verified in code and rerun suite                                | ✅     |

---

## Gaps / Not Tested

| Gap                                                | Risk   | Note                                                                                                     |
| -------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------- |
| Final lint/typecheck/unit-test reruns are complete | Closed | Evidence captured on 2026-04-05                                                                          |
| RSC render-pass caching in actual Next.js runtime  | Low    | `React.cache()` semantics are framework-defined; unit tests simulate the request scope                   |
| New Relic span emission in production              | Low    | Facade guards against NR not being configured; observable in New Relic dashboard when license key is set |
