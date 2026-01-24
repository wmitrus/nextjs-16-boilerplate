# Technical Specification: Vitest Migration

## Technical Context

- **Runtime**: Node.js ^20
- **Framework**: Next.js 16, React 19
- **Current Test Runner**: Jest (CJS/ESM hybrid with experimental flags)
- **Target Test Runner**: Vitest (Native ESM)

## Implementation Approach

### 1. Dependencies

Install the following:

- `vitest`
- `@vitejs/plugin-react`
- `jsdom` (already present, but ensure compatibility)
- `vite-tsconfig-paths` (to support TS path aliases)
- `@vitest/ui` (optional, for better DX)

Remove:

- `jest` and related packages (`ts-jest`, `@types/jest`, `jest-environment-jsdom`, etc.)
- Remove experimental Node options from `package.json` scripts.

### 2. Configuration

Create `vitest.config.ts`:

- Configure `jsdom` environment.
- Use `react` plugin.
- Use `tsconfig-paths` plugin.
- Reference `tests/setup.ts` for global setup.
- Enable `globals: true` to minimize migration changes (or keep it `false` for cleaner ESM).

### 3. Setup and Polyfills

- Adapt `tests/setup.tsx` to use `vi` instead of `jest`.
- `tests/polyfills.ts` should remain largely compatible but might need minor adjustments for Vitest's environment.

### 4. Migration Strategy

- Batch update `jest.mock` to `vi.mock`.
- Replace `jest` globals with `vi` globals or imports from `vitest`.
- Update `package.json` scripts to use `vitest` instead of `jest`.

### 5. Coverage

- Use `@vitest/coverage-v8` for coverage reporting.
- Configure dedicated reports for unit and integration tests (`coverage/unit`, `coverage/integration`).
- Enforce 80% thresholds for Lines, Functions, Branches, and Statements.

## Source Code Structure Changes

- Delete `jest.config.ts`, `jest.unit.config.ts`, `jest.integration.config.ts`.
- Create `vitest.config.ts` (base), `vitest.unit.config.ts`, `vitest.integration.config.ts`.

## Verification Approach

- Run `pnpm test` and `pnpm test:integration`.
- Verify that tests run faster and without experimental flags.
- Run `pnpm typecheck` to ensure no `jest` types are lingering.

## Delivery Phases

1. **Infrastructure**: Install dependencies and create `vitest.config.ts`.
2. **Setup Adaptation**: Migrate `tests/setup.tsx` and `tests/polyfills.ts`.
3. **Test Migration**: Convert existing tests to Vitest syntax.
4. **Cleanup**: Remove Jest dependencies and configurations.
