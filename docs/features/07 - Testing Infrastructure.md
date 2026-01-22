# Testing Infrastructure

## Overview

This project implements a robust three-tier testing strategy to ensure code quality, reliability, and regression safety.

### 1. Unit Testing (Jest)

- **Tool**: [Jest](https://jestjs.io/) with `ts-jest` for ESM support.
- **Location**: Co-located with the source code (e.g., `src/**/*.test.ts(x)`).
- **Purpose**: Test individual functions, utilities, and components in isolation.
- **Commands**:
  - `pnpm test`: Runs all unit tests.

### 2. Integration Testing (Jest + React Testing Library + MSW)

- **Tool**: [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/) and [Mock Service Worker (MSW)](https://mswjs.io/).
- **Location**: Feature-based test files (e.g., `src/features/**/tests/*.integration.test.tsx`).
- **Purpose**: Test how components and pages interact with APIs and side effects.
- **Mocks**: MSW is used to intercept network requests and provide predictable responses.
- **Commands**:
  - `pnpm test:integration`: Runs all integration tests.

### 3. End-to-End (E2E) Testing (Playwright)

- **Tool**: [Playwright](https://playwright.dev/).
- **Location**: `e2e/` root directory.
- **Purpose**: Test complete user flows in real browser environments.
- **Commands**:
  - `pnpm e2e`: Runs E2E tests against the development server.

## Configuration Details

### pure ESM Environment

The testing environment is configured to run in pure ESM mode using:

- `NODE_OPTIONS='--experimental-vm-modules --import tsx'`
- `ts-jest` with `useESM: true`

### JSDOM Polyfills

To support modern browser APIs in JSDOM, a comprehensive polyfill suite is provided in `tests/polyfills.ts`, covering:

- `fetch` (via `undici` and `whatwg-fetch`)
- `Streams API`
- `BroadcastChannel`
- `Encoding API`

### Global Mocks

Common Next.js components like `next/image` are globally mocked in `tests/setup.tsx` to ensure compatibility with the testing environment.

## Best Practices

- **Co-location**: Keep unit tests close to the code they test.
- **Feature-based Integration**: Group integration tests within their respective features.
- **Clean Mocking**: Use MSW for API mocking to keep tests decoupled from actual backends.
- **Staged Checks**: Typechecking is enforced on every commit for staged files.
