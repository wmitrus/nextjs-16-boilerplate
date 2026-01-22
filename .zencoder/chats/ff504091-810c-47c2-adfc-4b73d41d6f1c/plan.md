# Full SDD workflow

## Workflow Steps

### [X] Step: Requirements

Create a Product Requirements Document (PRD) based on the feature description.

1. [x] Review existing codebase to understand current architecture and patterns
2. [x] Analyze the feature definition and identify unclear aspects
3. [x] Ask the user for clarifications on aspects that significantly impact scope or user experience
4. [x] Make reasonable decisions for minor details based on context and conventions
5. [x] If user can't clarify, make a decision, state the assumption, and continue

Save the PRD to `/home/ozi/projects/nextjs-16-boilerplate/.zencoder/chats/ff504091-810c-47c2-adfc-4b73d41d6f1c/requirements.md`.

### [X] Step: Technical Specification

Create a technical specification based on the PRD in `/home/ozi/projects/nextjs-16-boilerplate/.zencoder/chats/ff504091-810c-47c2-adfc-4b73d41d6f1c/requirements.md`.

1. [x] Review existing codebase architecture and identify reusable components
2. [x] Define the implementation approach

Save to `/home/ozi/projects/nextjs-16-boilerplate/.zencoder/chats/ff504091-810c-47c2-adfc-4b73d41d6f1c/spec.md` with:

- Technical context (language, dependencies)
- Implementation approach referencing existing code patterns
- Source code structure changes
- Data model / API / interface changes
- Delivery phases (incremental, testable milstones)
- Verification approach using project lint/test commands

### [X] Step: Planning

Create a detailed implementation plan based on `/home/ozi/projects/nextjs-16-boilerplate/.zencoder/chats/ff504091-810c-47c2-adfc-4b73d41d6f1c/spec.md`.

1. [x] Break down the work into concrete tasks
2. [x] Each task should reference relevant contracts and include verification steps
3. [x] Replace the Implementation step below with the planned tasks

Rule of thumb for step size: each step should represent a coherent unit of work (e.g., implement a component, add an API endpoint, write tests for a module). Avoid steps that are too granular (single function) or too broad (entire feature).

If the feature is trivial and doesn't warrant full specification, update this workflow to remove unnecessary steps and explain the reasoning to the user.

Save to `/home/ozi/projects/nextjs-16-boilerplate/.zencoder/chats/ff504091-810c-47c2-adfc-4b73d41d6f1c/plan.md`.

### [X] Step: Implementation

- [x] Install Vitest and related dependencies (`vitest`, `@vitejs/plugin-react`, `vite-tsconfig-paths`)
- [x] Create `vitest.config.ts`
- [x] Migrate `tests/setup.tsx` and `tests/polyfills.ts` (replace `jest` with `vi`)
- [x] Create `vitest.unit.config.ts` and `vitest.integration.config.ts`
- [x] Update `package.json` scripts (`test`, `test:integration`, `test:all`) with correct config paths
- [x] Verify separation with `pnpm test` and `pnpm test:integration`
- [x] Migrate existing tests (replace `jest.mock` with `vi.mock`, etc.)
- [x] Remove Jest dependencies and config files
- [x] Verify with `pnpm test` and `pnpm typecheck`
