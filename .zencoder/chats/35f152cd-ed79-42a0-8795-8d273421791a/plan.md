# Full SDD workflow

## Workflow Steps

### [x] Step: Requirements

Create a Product Requirements Document (PRD) based on the feature description.

1. Review existing codebase to understand current architecture and patterns
2. Analyze the feature definition and identify unclear aspects
3. Ask the user for clarifications on aspects that significantly impact scope or user experience
4. Make reasonable decisions for minor details based on context and conventions
5. If user can't clarify, make a decision, state the assumption, and continue

Save the PRD to `/home/ozi/projects/nextjs-16-boilerplate/.zencoder/chats/35f152cd-ed79-42a0-8795-8d273421791a/requirements.md`.

### [x] Step: Technical Specification

Create a technical specification based on the PRD in `/home/ozi/projects/nextjs-16-boilerplate/.zencoder/chats/35f152cd-ed79-42a0-8795-8d273421791a/requirements.md`.

1. Review existing codebase architecture and identify reusable components
2. Define the implementation approach

Save to `/home/ozi/projects/nextjs-16-boilerplate/.zencoder/chats/35f152cd-ed79-42a0-8795-8d273421791a/spec.md` with:

- Technical context (language, dependencies)
- Implementation approach referencing existing code patterns
- Source code structure changes
- Data model / API / interface changes
- Delivery phases (incremental, testable milestones)
- Verification approach using project lint/test commands

### [x] Step: Planning

Create a detailed implementation plan based on `/home/ozi/projects/nextjs-16-boilerplate/.zencoder/chats/35f152cd-ed79-42a0-8795-8d273421791a/spec.md`.

1. Break down the work into concrete tasks
2. Each task should reference relevant contracts and include verification steps
3. Replace the Implementation step below with the planned tasks

Save to `/home/ozi/projects/nextjs-16-boilerplate/.zencoder/chats/35f152cd-ed79-42a0-8795-8d273421791a/plan.md`.

### [x] Step: Implementation

#### 1. Fix Infrastructure and Tests

- [x] **Unify AppError imports**: Fix inconsistent imports in `with-error-handler.ts` and `with-action-handler.ts`.
- [x] **Fix Vitest environment mocking**: Update failing tests in `with-action-handler.test.ts` and `with-error-handler.test.ts` to correctly handle `process.env.NODE_ENV` mocking.
- [x] **Verify infrastructure**: Run unit tests and ensure all pass.

#### 2. Refine Server Action Handler

- [x] **Enhance `withActionHandler`**: Ensure it handles all `AppError` cases and unknown errors correctly, adhering to the `ApiResponse` contract.
- [x] **Audit Server Action usage**: Check if there are any existing actions that need to be wrapped.

#### 3. UI/UX Audit and Polish

- [x] **Audit `ErrorAlert`**: Ensure Tailwind 4 compliance and accessibility (ARIA roles).
- [x] **Verify Client Boundaries**: Test `ClientErrorBoundary` with manual triggers to ensure UI fallback is correct.
- [x] **Verify Segment Boundaries**: Check `src/app/e2e-error/page.tsx` and `error.tsx` manually or via unit tests.

#### 4. Final Quality Gate

- [x] **Run Lint and Typecheck**: `pnpm lint` and `pnpm typecheck`.
- [x] **Final Test Run**: Execute all tests related to error handling.
