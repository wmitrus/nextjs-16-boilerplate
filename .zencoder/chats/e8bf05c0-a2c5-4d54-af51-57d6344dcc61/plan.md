# Full SDD workflow

## Workflow Steps

### [x] Step: Requirements

Create a Product Requirements Document (PRD) based on the feature description.

1. Review existing codebase to understand current architecture and patterns
2. Analyze the feature definition and identify unclear aspects
3. Ask the user for clarifications on aspects that significantly impact scope or user experience
4. Make reasonable decisions for minor details based on context and conventions
5. If user can't clarify, make a decision, state the assumption, and continue

Save the PRD to `/home/ozi/projects/nextjs-16-boilerplate/.zencoder/chats/e8bf05c0-a2c5-4d54-af51-57d6344dcc61/requirements.md`.

### [x] Step: Technical Specification

Create a technical specification based on the PRD in `/home/ozi/projects/nextjs-16-boilerplate/.zencoder/chats/e8bf05c0-a2c5-4d54-af51-57d6344dcc61/requirements.md`.

1. Review existing codebase architecture and identify reusable components
2. Define the implementation approach

Save to `/home/ozi/projects/nextjs-16-boilerplate/.zencoder/chats/e8bf05c0-a2c5-4d54-af51-57d6344dcc61/spec.md` with:

- Technical context (language, dependencies)
- Implementation approach referencing existing code patterns
- Source code structure changes
- Data model / API / interface changes
- Delivery phases (incremental, testable milestones)
- Verification approach using project lint/test commands

### [x] Step: Planning

Create a detailed implementation plan based on `/home/ozi/projects/nextjs-16-boilerplate/.zencoder/chats/e8bf05c0-a2c5-4d54-af51-57d6344dcc61/spec.md`.

1. Break down the work into concrete tasks
2. Each task should reference relevant contracts and include verification steps
3. Replace the Implementation step below with the planned tasks

### Implementation Plan

#### Phase 1: Unit Testing Foundation

- [x] Install dependencies: `jest`, `jest-environment-jsdom`, `ts-jest`, `@types/jest`, `tsx`
- [x] Create `jest.config.ts` (base configuration)
- [x] Create `jest.unit.config.ts` (unit-specific configuration)
- [x] Update `package.json` with `test` script (using `tsx` loader)
- [x] Create a sample unit test to verify setup (`src/shared/utils/math.test.ts`)
- [x] **Verification**: Run `pnpm test` and ensure it passes.

#### Phase 2: Integration Testing Foundation

- [x] Install dependencies: `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `msw`, `undici`, `whatwg-fetch`
- [x] Create `jest.integration.config.ts` (integration-specific configuration)
- [x] Create `tests/setup.ts` and `tests/polyfills.ts` (Jest setup and polyfills)
- [x] Create MSW infrastructure in `src/shared/lib/mocks/` (`handlers.ts`, `server.ts`)
- [x] Create global mocks in `src/core/mocks/`
- [x] Update `package.json` with `test:integration` script
- [x] Create a sample integration test to verify setup (`src/shared/components/Sample/tests/Sample.integration.test.tsx`)
- [x] **Verification**: Run `pnpm test:integration` and ensure it passes.

#### Phase 3: E2E Testing Foundation

- [x] Install Playwright: `pnpm add -D @playwright/test` and `npx playwright install chromium`
- [x] Create `playwright.config.ts`
- [x] Update `package.json` with `e2e` and `e2e:ui` scripts
- [x] Create a sample E2E test to verify setup (`e2e/home.spec.ts`)
- [x] **Verification**: Run `pnpm e2e` and ensure it passes.

#### Phase 4: Finalization

- [x] Update `package.json` with `test:all` script
- [x] Run `pnpm lint` and `pnpm typecheck` to ensure everything is correct
- [x] **Verification**: All linting and type-checking passes.
