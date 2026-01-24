# Full SDD workflow

## Workflow Steps

### [x] Step: Requirements

Create a Product Requirements Document (PRD) based on the feature description.

1. Review existing codebase to understand current architecture and patterns
2. Analyze the feature definition and identify unclear aspects
3. Ask the user for clarifications on aspects that significantly impact scope or user experience
4. Make reasonable decisions for minor details based on context and conventions
5. If user can't clarify, make a decision, state the assumption, and continue

Save the PRD to `/home/ozi/projects/nextjs-16-boilerplate/.zencoder/chats/1cbfb043-ce71-435d-8fd5-04447d32b431/requirements.md`.

### [x] Step: Technical Specification

Create a technical specification based on the PRD in `/home/ozi/projects/nextjs-16-boilerplate/.zencoder/chats/1cbfb043-ce71-435d-8fd5-04447d32b431/requirements.md`.

1. Review existing codebase architecture and identify reusable components
2. Define the implementation approach

Save to `/home/ozi/projects/nextjs-16-boilerplate/.zencoder/chats/1cbfb043-ce71-435d-8fd5-04447d32b431/spec.md` with:

- Technical context (language, dependencies)
- Implementation approach referencing existing code patterns
- Source code structure changes
- Data model / API / interface changes
- Delivery phases (incremental, testable milestones)
- Verification approach using project lint/test commands

### [x] Step: Planning

Create a detailed implementation plan based on `/home/ozi/projects/nextjs-16-boilerplate/.zencoder/chats/1cbfb043-ce71-435d-8fd5-04447d32b431/spec.md`.

1. Break down the work into concrete tasks
2. Each task should reference relevant contracts and include verification steps
3. Replace the Implementation step below with the planned tasks

Rule of thumb for step size: each step should represent a coherent unit of work (e.g., implement a component, add an API endpoint, write tests for a module). Avoid steps that are too granular (single function) or too broad (entire feature).

If the feature is trivial and doesn't warrant full specification, update this workflow to remove unnecessary steps and explain the reasoning to the user.

Save to `/home/ozi/projects/nextjs-16-boilerplate/.zencoder/chats/1cbfb043-ce71-435d-8fd5-04447d32b431/plan.md`.

### [x] Step: Implementation

#### Phase 1: CI/CD Setup

- [x] Task 1: Install `chromatic` package as devDependency
- [x] Task 2: Add `chromatic` script to `package.json`
- [x] Task 3: Improve `.github/workflows/deployChromatic.yml` with latest actions and pnpm 10
- [x] Task 4: Create `docs/features/09 - Chromatic Integration.md` with setup instructions

#### Phase 2: Verification

- [x] Task 5: Run `pnpm lint` and `pnpm typecheck`
- [x] Task 6: Verify YAML workflow syntax
- [x] Task 7: Configure T3 environment variables
- [x] Task 8: Optimize CI/CD workflow with `exitOnceUploaded` and `autoAcceptChanges`
