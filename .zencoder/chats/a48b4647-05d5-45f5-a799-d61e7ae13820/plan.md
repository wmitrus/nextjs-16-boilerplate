# Full SDD workflow

## Workflow Steps

### [x] Step: Requirements

Create a Product Requirements Document (PRD) based on the feature description.

1. Review existing codebase to understand current architecture and patterns
2. Analyze the feature definition and identify unclear aspects
3. Ask the user for clarifications on aspects that significantly impact scope or user experience
4. Make reasonable decisions for minor details based on context and conventions
5. If user can't clarify, make a decision, state the assumption, and continue

Save the PRD to `/home/ozi/projects/nextjs-16-boilerplate/.zencoder/chats/a48b4647-05d5-45f5-a799-d61e7ae13820/requirements.md`.

### [x] Step: Technical Specification

Create a technical specification based on the PRD in `/home/ozi/projects/nextjs-16-boilerplate/.zencoder/chats/a48b4647-05d5-45f5-a799-d61e7ae13820/requirements.md`.

1. Review existing codebase architecture and identify reusable components
2. Define the implementation approach

Save to `/home/ozi/projects/nextjs-16-boilerplate/.zencoder/chats/a48b4647-05d5-45f5-a799-d61e7ae13820/spec.md` with:

- Technical context (language, dependencies)
- Implementation approach referencing existing code patterns
- Source code structure changes
- Data model / API / interface changes
- Delivery phases (incremental, testable milestones)
- Verification approach using project lint/test commands

### [ ] Step: Planning

Create a detailed implementation plan based on `/home/ozi/projects/nextjs-16-boilerplate/.zencoder/chats/a48b4647-05d5-45f5-a799-d61e7ae13820/spec.md`.

1. Break down the work into concrete tasks
2. Each task should reference relevant contracts and include verification steps
3. Replace the Implementation step below with the planned tasks

Rule of thumb for step size: each step should represent a coherent unit of work (e.g., implement a component, add an API endpoint, write tests for a module). Avoid steps that are too granular (single function) or too broad (entire feature).

If the feature is trivial and doesn't warrant full specification, update this workflow to remove unnecessary steps and explain the reasoning to the user.

Save to `/home/ozi/projects/nextjs-16-boilerplate/.zencoder/chats/a48b4647-05d5-45f5-a799-d61e7ae13820/plan.md`.

### [x] Step: Implementation

1. [x] **Implement Types and AppError**
   - Create `src/shared/types/api-response.ts`.
   - Define `ApiResponse` union and `AppError` class.
   - Verification: `pnpm typecheck`.

2. [x] **Implement Response Service**
   - Create `src/shared/lib/response-service.ts`.
   - Implement `createSuccessResponse`, `createValidationErrorResponse`, `createServerErrorResponse`, `createRedirectResponse`.
   - Verification: Unit tests in `src/shared/lib/response-service.test.ts`.

3. [x] **Implement Error Handler Wrapper and Mapper**
   - Create `src/shared/lib/with-error-handler.ts`.
   - Implement HOC to wrap API routes.
   - Implement error mapping for `AppError` and generic errors.
   - Integration with `getServerLogger`.
   - Verification: Integration tests in `src/shared/lib/with-error-handler.test.ts`.

4. [x] **Implement Client Handler**
   - Create `src/shared/lib/api-client-handler.ts`.
   - Implement `handleApiResponse`.
   - Verification: Unit tests in `src/shared/lib/api-client-handler.test.ts`.

5. [x] **Update Existing API Route**
   - Update `src/app/api/users/route.ts` to use `withErrorHandler`.
   - Verification: Manual test or integration test for `/api/users`.

6. [x] **Final Verification**
   - Run `pnpm lint` and `pnpm typecheck`.
   - Ensure all tests pass.
