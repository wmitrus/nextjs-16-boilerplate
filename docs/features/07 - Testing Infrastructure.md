# Testing Infrastructure

## Overview

This project implements a robust three-tier testing strategy to ensure code quality, reliability, and regression safety.

### 1. Unit Testing (Vitest)

- **Tool**: [Vitest](https://vitest.dev/) with native ESM support.
- **Location**: Co-located with the source code (e.g., `src/**/*.test.ts(x)`).
- **Purpose**: Test individual functions, utilities, and components in isolation.
- **Commands**:
  - `pnpm test`: Runs all unit tests.
  - `pnpm test:watch`: Runs tests in watch mode.
  - Coverage reports are generated in `coverage/unit` (HTML/JSON/text).
  - Coverage is report-only for now (no enforced thresholds).

### 2. Integration Testing (Vitest + React Testing Library + MSW)

- **Tool**: [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/) and [Mock Service Worker (MSW)](https://mswjs.io/).
- **Location**: Feature-based test files (e.g., `src/features/**/tests/*.integration.test.tsx`).
- **Purpose**: Test how components and pages interact with APIs and side effects.
- **Mocks**: MSW is used to intercept network requests and provide predictable responses.
- **Commands**:
  - `pnpm test:integration`: Runs all integration tests.
  - Coverage reports are generated in `coverage/integration` (HTML/JSON/text).
  - Coverage is report-only for now (no enforced thresholds).

### 3. End-to-End (E2E) Testing (Playwright)

- **Tool**: [Playwright](https://playwright.dev/).
- **Location**: `e2e/` root directory.
- **Purpose**: Test complete user flows in real browser environments.
- **Commands**:
  - `pnpm e2e`: Runs E2E tests against the development server.

## Configuration Details

### Native ESM Environment

The testing environment uses Vitest for native ESM support, providing fast transpilation via Vite and a Jest-compatible API without the need for experimental Node.js flags.

### JSDOM Polyfills

To support modern browser APIs in JSDOM, a comprehensive polyfill suite is provided in `tests/polyfills.ts`, covering:

- `fetch` (via `undici` and `whatwg-fetch`)
- `Streams API`
- `BroadcastChannel`
- `Encoding API`

### Global Mocks

Common Next.js components like `next/image` are globally mocked in `tests/setup.tsx` to ensure compatibility with the testing environment using Vitest's `vi.mock`.

## Best Practices

- **Co-location**: Keep unit tests close to the code they test.
- **Feature-based Integration**: Group integration tests within their respective features.
- **Clean Mocking**: Use MSW for API mocking to keep tests decoupled from actual backends.
- **Staged Checks**: Typechecking is enforced on every commit for staged files.
