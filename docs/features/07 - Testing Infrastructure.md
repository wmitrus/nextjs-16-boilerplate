# Testing Infrastructure

## Overview

This project implements a robust three-tier testing strategy to ensure code quality, reliability, and regression safety.

### 1. Unit Testing (Vitest)

- **Tool**: [Vitest](https://vitest.dev/) with native ESM support.
- **Location**: Co-located with the source code (e.g., `src/**/*.test.ts(x)`).
- **Purpose**: Test individual functions, utilities, and components in isolation.
- **Commands**:
  - `pnpm test`: Runs unit tests with coverage reporting.
  - `pnpm test:watch`: Runs unit tests in watch mode.
- **Coverage**:
  - Reports generated in `coverage/unit`.
  - **Thresholds**: Enforced at **80%** (Lines, Functions, Branches, Statements).
  - Scope: Focuses on core logic, utilities, and feature components (excludes `src/app`).

### 2. Integration Testing (Vitest + React Testing Library + MSW)

- **Tool**: [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/) and [Mock Service Worker (MSW)](https://mswjs.io/).
- **Location**: Feature-based test files (e.g., `src/features/**/tests/*.integration.test.tsx`).
- **Purpose**: Test how components and pages interact with APIs and side effects.
- **Mocks**: MSW is used to intercept network requests and provide predictable responses.
- **Commands**:
  - `pnpm test:integration`: Runs integration tests with coverage reporting.
- **Coverage**:
  - Reports generated in `coverage/integration`.
  - **Thresholds**: Enforced at **80%** (Lines, Functions, Branches, Statements).
  - Scope: Focuses on `src/app` and `src/features`.

### 3. End-to-End (E2E) Testing (Playwright)

- **Tool**: [Playwright](https://playwright.dev/).
- **Location**: `e2e/` root directory.
- **Purpose**: Test complete user flows in real browser environments.
- **Commands**:
  - `pnpm e2e`: Runs E2E tests against the development server.
  - `pnpm e2e:auth-matrix:ci`: Builds the app and runs the auth/bootstrap/onboarding matrix in CI mode.
  - `pnpm e2e:ci`: Builds the app and runs the broader scenario matrix in CI mode.

#### E2E configuration notes

- Local Playwright runs start `pnpm dev`; CI Playwright runs start `pnpm start`.
- CI-facing Playwright commands therefore build before execution.
- The Playwright web server sets `E2E_ENABLED=true` and `NEXT_PUBLIC_E2E_ENABLED=true`.
- **Environment Flags**: These flags are injected specifically for E2E runs and are intentionally omitted from `src/core/env.ts` to keep them isolated from standard build/runtime validation.
- A test-only route (`/e2e-error`) is gated by `NEXT_PUBLIC_E2E_ENABLED` and is only intended for E2E boundary validation.
- Dev overlay is disabled for E2E runs via `NEXT_DISABLE_DEV_OVERLAY=1` to avoid click interception.
- When `PLAYWRIGHT_SERVER_LOG_DIR` is set, the runner disables local server reuse and forces the app runtime to write server evidence into that explicit path.
- The stable repository path for uploaded server evidence is `logs/playwright/...` rather than `test-results/...`, because `test-results` is Playwright-managed output.

#### E2E workflow split in GitHub Actions

- Auth-matrix workflow: [../../.github/workflows/e2e-label.yml](../../.github/workflows/e2e-label.yml)
  - PR label: `run-e2e`
  - manual dispatch supported
  - command: `pnpm e2e:auth-matrix:ci`
- Broad matrix workflow: [../../.github/workflows/e2e-matrix.yml](../../.github/workflows/e2e-matrix.yml)
  - PR label: `run-e2e-matrix`
  - manual dispatch supported
  - command: `pnpm e2e:ci`

This split allows auth evidence collection and the broader scenario suite to run independently.

#### When to add E2E tests

Use E2E tests for behaviors that require a real browser/runtime and cannot be reliably validated by unit or integration tests, such as:

- Browser console logging/output and runtime-only APIs.
- Environment-dependent client behavior (e.g., public env flags at build/runtime).
- Full-page navigation and user interactions across routes.

#### Where to place E2E tests

- Keep E2E specs in the root-level `e2e/` folder.
- Prefer stable UI hooks that already exist in product UI, rather than adding test-only components.

Example: the browser logger flow is validated in [e2e/users.spec.ts](e2e/users.spec.ts) by asserting the existing users page emits a browser log on load.

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
- **E2E Scope**: Reserve E2E for runtime-only behavior (browser console, navigation, env-driven behavior).
