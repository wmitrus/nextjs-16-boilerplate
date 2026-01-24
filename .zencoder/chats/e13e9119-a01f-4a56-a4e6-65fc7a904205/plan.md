# Full SDD workflow

## Workflow Steps

### [x] Step: Requirements

Create a Product Requirements Document (PRD) based on the feature description.

- [x] Review existing codebase
- [x] Analyze feature definition
- [x] Make decisions based on context
- [x] Save PRD to `requirements.md`

### [x] Step: Technical Specification

Create a technical specification based on the PRD.

- [x] Review architecture
- [x] Define implementation approach
- [x] Save to `spec.md`

### [x] Step: Planning

Create a detailed implementation plan based on `spec.md`.

- [x] Break down the work into concrete tasks
- [x] Replace the Implementation step below with the planned tasks
- [x] Save to `plan.md`

### [ ] Step: Implementation

#### Phase 1: Setup

- [x] Install dependencies (`pino`, `pino-pretty`, `pino-logflare`)
- [x] Update `src/core/env.ts` with logger schemas
- [x] Update `.env.example` with new logger variables

#### Phase 2: Core Implementation

- [x] Create `src/core/logger/utils.ts` (Stream helpers)
- [x] Create `src/core/logger/streams.ts` (Declarative stream builder)
- [x] Create `src/core/logger/server.ts` (Server-side logger)
- [x] Create `src/core/logger/browser.ts` (Browser-side logger)
- [x] Create `src/core/logger/edge.ts` (Edge-side logger)
- [x] Create `src/core/logger/index.ts` (Main entry point with env selection)

#### Phase 3: Cleanup & Integration

- [x] Remove `src/shared/lib/logger` directory
- [x] Update any existing imports (if any) to `@/core/logger`
- [x] Ensure `src/lib/logger/utils` references are fixed (from existing `pino.ts`)

#### Phase 4: Verification

- [x] Run `pnpm typecheck`
- [x] Run `pnpm lint`
- [x] Run unit tests for logger (porting from old tests)
