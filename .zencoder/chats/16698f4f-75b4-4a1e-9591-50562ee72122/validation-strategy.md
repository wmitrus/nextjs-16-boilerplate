# Validation Strategy: Per-Request DI Container Caching

**Task ID**: `2026-04-05-per-request-caching`
**Agent**: 05 — Validation Strategy
**Status**: ✅ Complete
**Date**: 2026-04-05

---

## Task

Validate that the `React.cache()` wrapper on `getAppContainer()` correctly memoizes the Container per RSC render pass without breaking existing tests, call-site behaviour, or type safety.

---

## Mode

**Change Validation** — scoped to the per-request caching feature implementation.

---

## Validation Objective

Prove the following invariants:

1. Within one simulated React server render pass, multiple calls to `getAppContainer()` return the same Container instance.
2. Across separate simulated requests (separate `cache()` scopes), calls to `getAppContainer()` return different Container instances.
3. `getAppContainer().createChild()` produces a child that resolves through the shared parent.
4. Server Actions calling `getAppContainer()` receive per-invocation containers (not shared with RSC pass).
5. Typecheck and lint pass with no regressions.

---

## Current Validation Surfaces

| Surface           | Config                         | Command                 | Status                     |
| ----------------- | ------------------------------ | ----------------------- | -------------------------- |
| Unit tests        | `vitest.unit.config.ts`        | `pnpm test`             | Active                     |
| Integration tests | `vitest.integration.config.ts` | `pnpm test:integration` | Active                     |
| Typecheck         | `tsconfig.json`                | `pnpm typecheck`        | Active — mandatory         |
| Lint              | `eslint.config.mjs`            | `pnpm lint --fix`       | Active — mandatory         |
| E2E               | `playwright.config.ts`         | `pnpm e2e`              | Not required for this task |
| Storybook         | `vitest.config.ts`             | `pnpm test:storybook`   | Not required               |

---

## Risk Areas

| Risk                                                          | Level  | Rationale                                                                                                                                           |
| ------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deduplication failure — cached factory defined in wrong scope | High   | If `getRequestScopedContainer` is defined inside `getAppContainer()` body, each call creates a new `cache()` scope and deduplication silently fails |
| Cross-request Container leakage                               | Medium | If `cache()` does not reset between requests, Container from request N is served to request N+1 — data/auth contamination risk                      |
| Test isolation regression                                     | Medium | Vitest module-level isolation — the `cache()` scope in tests may behave differently from runtime; must confirm test design                          |
| Child container parent reference                              | Low    | `createChild()` must reference the cached parent, not a stale reference                                                                             |
| TypeScript type regression                                    | Low    | `React.cache()` wraps a function — return type inference must still be `Container`                                                                  |

---

## Minimum Required Validation

### MR-1: Unit Test — Same Instance Within Cache Scope

**File**: `src/core/runtime/bootstrap.test.ts` (add to existing test file)

**What to test**: Within the same `React.cache()` scope, two calls to `getAppContainer()` return `===` the same object.

**Test approach**:

```typescript
// Uses React's cache() test utilities or a direct scope simulation
// React's cache() can be tested by calling the same module-level function twice
// in the same synchronous execution context

it('returns the same Container instance on repeated calls within a render scope', () => {
  const containerA = getAppContainer();
  const containerB = getAppContainer();
  expect(containerA).toBe(containerB); // strict reference equality
});
```

**Important note on Vitest module isolation**: `React.cache()` in the Node.js test environment (not a browser, not the full RSC runtime) behaves as a module-level memoization. Within one test case, the cache persists across calls. The cache is reset when the module is re-imported (which Vitest does per test file). This is the correct behaviour for unit testing.

**Challenge**: If `vi.resetModules()` or module mocking is used in the existing test file, the cache state may be cleared between test cases (which is actually desirable). The test must be designed to call `getAppContainer()` twice within the same test case, not across separate test cases.

### MR-2: Unit Test — Different Instance After Cache Clear

**File**: `src/core/runtime/bootstrap.test.ts`

**What to test**: After clearing the module (simulating a new request), `getAppContainer()` returns a new Container instance.

**Test approach**:

```typescript
it('returns a fresh Container when module is re-initialized (simulating new request)', async () => {
  vi.resetModules();
  const { getAppContainer: getA } = await import('./bootstrap');
  const containerA = getA();

  vi.resetModules();
  const { getAppContainer: getB } = await import('./bootstrap');
  const containerB = getB();

  expect(containerA).not.toBe(containerB);
});
```

### MR-3: Unit Test — Child Container Compatibility

**File**: `src/core/runtime/bootstrap.test.ts`

**What to test**: `getAppContainer().createChild()` returns a Container whose parent is the shared cached Container.

```typescript
it('createChild() produces a child of the shared cached container', () => {
  const parent = getAppContainer();
  const child = parent.createChild();
  // register something in parent after child creation
  const KEY = Symbol('TestKey');
  parent.register(KEY, { value: 42 });
  // child should resolve from parent
  expect(child.resolve(KEY)).toEqual({ value: 42 });
});
```

### MR-4: Typecheck

Command: `pnpm typecheck`

Expected: Zero errors. `React.cache()` wrapping `() => Container` infers return type as `Container` correctly.

### MR-5: Lint

Command: `pnpm lint --fix`

Expected: Zero errors after auto-fix. Import order and formatting are auto-corrected.

---

## Optional Additional Validation

### OPT-1: Integration Test — RSC Multi-Component Shared Container

**File**: `src/core/runtime/bootstrap.integration.test.ts` (new)

**What to test**: Simulate a Next.js RSC render scenario where multiple async functions (simulating Layout + Page) call `getAppContainer()` concurrently within the same React `cache()` boundary.

**Approach**: Use React's `cache()` test utilities or structure the test so both calls occur within the same synchronous/async execution scope that shares the `cache()` context.

**Value**: Higher confidence that the behaviour survives the actual RSC concurrency model.

### OPT-2: Integration Test — Server Action Isolation

**File**: `src/core/runtime/bootstrap.integration.test.ts`

**What to test**: Two simulated Server Action invocations (separate `cache()` resets) produce different Container instances even if called close together.

**Value**: Guards against accidental cross-invocation sharing.

---

## Validation Not Required

| Surface                      | Reason                                         |
| ---------------------------- | ---------------------------------------------- |
| Playwright E2E               | No user-visible behaviour change; no demo page |
| Storybook stories            | No UI component change                         |
| MSW handlers                 | No HTTP adapter or external call change        |
| Security/auth test expansion | No auth logic change                           |
| DB integration tests         | No DB access pattern change                    |
| Edge runtime tests           | Edge path (`proxy.ts`, `edge.ts`) is unchanged |

---

## Validation Commands

```bash
# Run before implementation (baseline):
pnpm typecheck
pnpm lint --fix
pnpm test -- --reporter=verbose src/core/runtime/

# Run after implementation:
pnpm typecheck
pnpm lint --fix
pnpm test -- --reporter=verbose src/core/runtime/bootstrap.test.ts
pnpm test:integration -- --reporter=verbose src/core/runtime/  # if OPT-1 added
```

---

## Validation Gaps

| Gap                                                    | Risk   | Recommendation                                                                                                                                                                                                                                                              |
| ------------------------------------------------------ | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full RSC runtime not simulated in unit tests           | Medium | The React test environment does not perfectly replicate Next.js RSC `cache()` scoping. The unit tests will verify the memoization under Node.js module semantics. For production confidence, manual smoke-test after deployment (or OPT-1 integration test) covers the gap. |
| `React.cache()` behaviour in Server Actions not tested | Low    | Server Actions in test environment behave as regular async functions. The per-invocation behaviour is implied by module-level constant semantics. No specific test required unless a regression is observed.                                                                |

---

## Summary

| Validation Item                      | Required        | Command                 |
| ------------------------------------ | --------------- | ----------------------- |
| Unit: same instance within scope     | ✅ MR-1         | `pnpm test`             |
| Unit: fresh instance after reset     | ✅ MR-2         | `pnpm test`             |
| Unit: child container compatibility  | ✅ MR-3         | `pnpm test`             |
| Typecheck                            | ✅ MR-4         | `pnpm typecheck`        |
| Lint                                 | ✅ MR-5         | `pnpm lint --fix`       |
| Integration: RSC multi-component     | ⚡ OPT-1        | `pnpm test:integration` |
| Integration: Server Action isolation | ⚡ OPT-2        | `pnpm test:integration` |
| E2E                                  | ❌ Not required | —                       |
