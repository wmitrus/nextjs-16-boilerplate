# Bug Investigation: CI Quality Check Failure

## 1. Objective

Identify why the CI `Quality Checks` workflow fails on the `pnpm test` step (unit test run).

---

## 2. Symptom Summary

- **What fails**: `scripts/check-e2e-auth-env.test.ts` — the only failing test suite out of 118
- **Error**: `Error: process.exit unexpectedly called with "1"`
- **All 784 individual test assertions pass** — only the suite-level failure triggers the CI exit code 1
- **Reproducible**: Deterministic in CI because E2E env vars are never set in the unit test environment

---

## 3. Confirmed Evidence

### Failure location (log lines ~21:01:43)

```
FAIL   unit  scripts/check-e2e-auth-env.test.ts
Error: process.exit unexpectedly called with "1"
 ❯ main scripts/check-e2e-auth-env.mjs:319:13
 ❯ scripts/check-e2e-auth-env.mjs:337:1
 ❯ scripts/check-e2e-auth-env.test.ts:3:1
```

### Root cause: unconditional `main()` call at module level

`scripts/check-e2e-auth-env.mjs` line 337:

```js
main();
```

This runs unconditionally when the module is **imported**, not just when it is directly executed as a CLI script.

### What `main()` does

`main()` at line 233 checks for E2E Clerk fixture env vars (`E2E_CLERK_*`, `CLERK_SECRET_KEY`, etc.). In CI unit test runs these are not set. So `main()` hits `process.exit(1)` at line 319.

### The test file only imports `validateClerkRedirectEnv`

```ts
// scripts/check-e2e-auth-env.test.ts
import { validateClerkRedirectEnv } from './check-e2e-auth-env.mjs';
```

This import triggers module evaluation, which runs `main()` as a side effect.

### Established pattern in the same codebase — NOT followed in this file

Three other scripts use the correct ES module guard:

- `scripts/check-env-consistency.mjs:93`: `if (process.argv[1] === fileURLToPath(import.meta.url))`
- `scripts/reset-pglite.mjs:132`: same pattern
- `scripts/setup-env.mjs:52`: same pattern

`check-e2e-auth-env.mjs` does **not** use this guard — it calls `main()` bare at the bottom.

---

## 4. Execution Path

1. Vitest unit runner starts, discovers `scripts/check-e2e-auth-env.test.ts`
2. Test file imports `validateClerkRedirectEnv` from `./check-e2e-auth-env.mjs`
3. Node evaluates the module → reaches `main()` call at line 337
4. `main()` loads env via `loadScenarioEnv()`, checks base requirements (CLERK keys missing)
5. All user/org groups are checked as default scenario — all missing
6. `missing.length > 0` → `console.error(...)` + `process.exit(1)` at line 319
7. Vitest intercepts `process.exit(1)` and fails the suite with: `"process.exit unexpectedly called with '1'"`

---

## 5. Source-of-Truth Analysis

- **Expected behavior**: `main()` should only run when the script is executed directly as a CLI binary
- **Actual behavior**: `main()` runs on every import (including test imports), causing side effects that fail the test suite
- **Source of truth for the fix pattern**: `check-env-consistency.mjs`, `reset-pglite.mjs`, `setup-env.mjs` — all use the `process.argv[1] === fileURLToPath(import.meta.url)` guard

---

## 6. Likely Failure Points

1. **Confirmed** — `main()` call at `check-e2e-auth-env.mjs:337` is unconditional
2. **Confirmed** — No `import.meta.url` guard wrapping the `main()` invocation
3. **Confirmed** — `main()` exits with code 1 when E2E env vars are absent (expected in unit CI)

---

## 7. Hypotheses

| Hypothesis                                                                         | Status                          |
| ---------------------------------------------------------------------------------- | ------------------------------- |
| `main()` called unconditionally at module level causes `process.exit(1)` on import | **Confirmed root cause**        |
| Missing E2E env vars in CI unit test environment                                   | **Confirmed trigger condition** |
| Test only imports one exported function; the rest of `main()` is a side effect     | **Confirmed**                   |

---

## 8. Missing Evidence / Uncertainty

None. Root cause is fully confirmed with direct code evidence.

---

## 9. Proposed Solution

Wrap the `main()` call at `scripts/check-e2e-auth-env.mjs:337` with the ES module "is entry point" guard — matching the pattern already used in three sibling scripts:

```js
// Replace bare:
main();

// With:
import { fileURLToPath } from 'node:url';

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
```

`fileURLToPath` may already be importable from the existing imports in the file — check before adding a duplicate import.

### Affected file

- `scripts/check-e2e-auth-env.mjs` — lines 337 (and top-level imports)

### Regression test

The existing test `scripts/check-e2e-auth-env.test.ts` already covers `validateClerkRedirectEnv`. No new test is needed — the fix makes the import side-effect-free, which is what the test requires to pass. The test suite should pass cleanly after the fix.

---

## 10. Implementation Notes

_(To be filled in after implementation)_
