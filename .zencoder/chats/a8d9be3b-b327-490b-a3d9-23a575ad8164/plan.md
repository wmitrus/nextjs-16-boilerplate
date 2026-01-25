# Full SDD workflow

## Workflow Steps

### [x] Step: Requirements

Create a Product Requirements Document (PRD) based on the feature description.

1. Review existing codebase to understand current architecture and patterns
2. Analyze the feature definition and identify unclear aspects
3. Ask the user for clarifications on aspects that significantly impact scope or user experience
4. Make reasonable decisions for minor details based on context and conventions
5. If user can't clarify, make a decision, state the assumption, and continue

Save the PRD to `/home/ozi/projects/nextjs-16-boilerplate/.zencoder/chats/a8d9be3b-b327-490b-a3d9-23a575ad8164/requirements.md`.

### [x] Step: Technical Specification

Create a technical specification based on the PRD in `/home/ozi/projects/nextjs-16-boilerplate/.zencoder/chats/a8d9be3b-b327-490b-a3d9-23a575ad8164/requirements.md`.

1. Review existing codebase architecture and identify reusable components
2. Define the implementation approach

Save to `/home/ozi/projects/nextjs-16-boilerplate/.zencoder/chats/a8d9be3b-b327-490b-a3d9-23a575ad8164/spec.md` with:

- Technical context (language, dependencies)
- Implementation approach referencing existing code patterns
- Source code structure changes
- Data model / API / interface changes
- Delivery phases (incremental, testable milestones)
- Verification approach using project lint/test commands

### [x] Step: Planning

Create a detailed implementation plan based on `/home/ozi/projects/nextjs-16-boilerplate/.zencoder/chats/a8d9be3b-b327-490b-a3d9-23a575ad8164/spec.md`.

1. Break down the work into concrete tasks
2. Each task should reference relevant contracts and include verification steps
3. Replace the Implementation step below with the planned tasks

### [x] Step: Implementation

#### Phase 1: Infrastructure & Dependencies

- [x] Install `@upstash/ratelimit` and `@upstash/redis`
- [x] Update `src/core/env.ts` with new variables
- [x] Update `.env.example` with new variables

#### Phase 2: Core Logic Implementation

- [x] Implement `src/shared/lib/get-ip.ts`
- [x] Implement `src/shared/lib/rate-limit-local.ts`
- [x] Implement `src/shared/lib/rate-limit.ts`
- [x] Implement `src/shared/lib/rate-limit-helper.ts`

#### Phase 3: Verification & Quality

- [x] Add unit tests for `rate-limit-local.ts`, `get-ip.ts`, and `rate-limit-helper.ts`
- [x] Verify with `pnpm lint` and `pnpm typecheck`
- [x] Verify with `pnpm test`
