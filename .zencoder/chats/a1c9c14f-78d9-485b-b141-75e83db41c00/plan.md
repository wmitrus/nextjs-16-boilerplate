# Full SDD workflow

## Workflow Steps

### [x] Step: Requirements

Create a Product Requirements Document (PRD) based on the feature description.

1. Review existing codebase to understand current architecture and patterns
2. Analyze the feature definition and identify unclear aspects
3. Ask the user for clarifications on aspects that significantly impact scope or user experience
4. Make reasonable decisions for minor details based on context and conventions
5. If user can't clarify, make a decision, state the assumption, and continue

Save the PRD to `/home/ozi/projects/nextjs-16-boilerplate/.zencoder/chats/a1c9c14f-78d9-485b-b141-75e83db41c00/requirements.md`.

### [x] Step: Technical Specification

Create a technical specification based on the PRD in `/home/ozi/projects/nextjs-16-boilerplate/.zencoder/chats/a1c9c14f-78d9-485b-b141-75e83db41c00/requirements.md`.

1. Review existing codebase architecture and identify reusable components
2. Define the implementation approach

Save to `/home/ozi/projects/nextjs-16-boilerplate/.zencoder/chats/a1c9c14f-78d9-485b-b141-75e83db41c00/spec.md` with:

- Technical context (language, dependencies)
- Implementation approach referencing existing code patterns
- Source code structure changes
- Data model / API / interface changes
- Delivery phases (incremental, testable milestones)
- Verification approach using project lint/test commands

### [ ] Step: Planning

Create a detailed implementation plan based on `/home/ozi/projects/nextjs-16-boilerplate/.zencoder/chats/a1c9c14f-78d9-485b-b141-75e83db41c00/spec.md`.

1. Break down the work into concrete tasks
2. Each task should reference relevant contracts and include verification steps
3. Replace the Implementation step below with the planned tasks

Save to `/home/ozi/projects/nextjs-16-boilerplate/.zencoder/chats/a1c9c14f-78d9-485b-b141-75e83db41c00/plan.md`.

### [ ] Step: Implementation

#### Phase 1: Configuration and Dependencies
- [x] Update `next.config.ts` to enable `cacheComponents`, `reactCompiler`, and Turbopack FS cache.
- [x] Install `babel-plugin-react-compiler@latest`.

#### Phase 2: Code Audit
- [x] Check `src/app` for sync access to `params`, `searchParams`, `cookies()`, `headers()`.
- [x] Update any found instances to use `await`.

#### Phase 3: Verification
- [x] Run `pnpm lint`.
- [x] Run `pnpm build`.

#### Phase 4: Documentation
- [x] Create `docs/features/01 - Next.js 16 Readiness.md`.
- [x] Update `README.md` with feature list.
