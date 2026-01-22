# PRD: Testing Infrastructure Improvement (ESM Optimization)

## Purpose

Evaluate and optimize the current "Full ESM" testing setup in the Next.js 16 boilerplate to improve developer experience, performance, and stability.

## Current State

- **Framework**: Next.js 16 (React 19, TypeScript 5).
- **Test Runner**: Jest with `ts-jest` for ESM support.
- **Runtime**: Node.js with `--experimental-vm-modules` and `tsx`.
- **Configuration**: `type: module` in `package.json`, `useESM: true` in `jest.config.ts`.
- **Issues**: Experimental flags, slow transpilation, complex mocking.

## Requirements

1. **Performance**: Improve test execution speed (ideally using SWC or Vitest).
2. **Stability**: Move away from experimental Node.js flags if possible, or use a more stable ESM-native runner.
3. **Compatibility**: Maintain full support for Next.js 16 features (Async APIs, React 19).
4. **Developer Experience**: Simplify mocking (especially for ESM modules) and reduce configuration boilerplate.
5. **Consistency**: Ensure unit and integration tests remain co-located and follow existing patterns.

## Proposed Options

1. **Vitest**: Native ESM support, built-in Vite transformation (fast), Jest-compatible API.
2. **Jest + @swc/jest**: Keep Jest ecosystem but replace `ts-jest` with SWC for significant speed gains. Requires deciding between pure ESM (experimental) or transpiling to CJS for tests.

## Success Criteria

- `pnpm test` and `pnpm test:integration` run successfully.
- Test execution time is reduced.
- ESM mocking is demonstrated and documented.
- No regression in existing tests.
