# Technical Specification: Multi-layered Testing Infrastructure

## 1. Technical Context

- **Language**: TypeScript 5
- **Framework**: Next.js 16 (App Router), React 19.2
- **Runtime**: Node.js ^20
- **Package Manager**: pnpm

## 2. Implementation Approach

We will implement a three-tier testing strategy:

1.  **Unit Tests (Jest)**: Co-located with source files. Focused on pure functions and isolated logic.
2.  **Integration Tests (Jest + RTL + MSW)**: Located in `tests/` subdirectories within `features` or `shared`. Focused on component interactions and API communication.
3.  **E2E Tests (Playwright)**: Located in a root-level `e2e/` directory, mirroring the `app/` structure.

### Key Patterns

- **MSW**: Used to intercept `fetch` requests in Jest.
- **RSC Testing**: Leveraging emerging patterns for testing React Server Components.
- **Async Dynamic APIs**: Ensuring tests handle `await` for `params`, `cookies`, etc.

## 3. Source Code Structure Changes

- `jest.config.ts`: Base Jest configuration.
- `jest.unit.config.ts`: Specific config for unit tests.
- `jest.integration.config.ts`: Specific config for integration tests.
- `playwright.config.ts`: Playwright configuration.
- `src/shared/lib/mocks/`:
  - `server.ts`: MSW server setup (for Jest/Node).
  - `handlers.ts`: Shared MSW request handlers.
- `src/core/mocks/`: Global manual mocks for third-party modules (e.g., Clerk).
- `tests/`:
  - `setup.ts`: Global Jest setup (matchers, MSW lifecycle).
  - `utils/`: Test utilities (custom `render` with providers).
- `e2e/`: Root directory for Playwright specs mirroring `src/app/`.

### Naming Conventions

- **Unit Tests**: `[name].test.ts(x)` co-located with source.
- **Integration Tests**: `[name].integration.test.tsx` in `tests/` sub-directories.
- **E2E Tests**: `[name].spec.ts` in `e2e/` directory.

## 4. Delivery Phases

### Phase 1: Unit Testing Foundation

- Install Jest, `ts-jest`, and related types.
- Configure `jest.unit.config.ts`.
- Add `pnpm test` script.

### Phase 2: Integration Testing Foundation

- Install React Testing Library, MSW.
- Configure `jest.integration.config.ts`.
- Setup `src/shared/lib/mocks/` and `tests/setup.ts`.
- Add `pnpm test:integration` script.

### Phase 3: E2E Testing Foundation

- Install Playwright.
- Configure `playwright.config.ts`.
- Add `pnpm e2e` script.

## 5. Verification Approach

- **Linting**: `pnpm lint` must pass for all new config files and tests.
- **Typecheck**: `pnpm typecheck` must pass.
- **Execution**: Run each new test command (`test`, `test:integration`, `e2e`) to ensure infrastructure is working.
