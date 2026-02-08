# Full SDD workflow

## Workflow Steps

### [x] Step: Requirements

Create a Product Requirements Document (PRD) based on the feature description.

1. Review existing codebase to understand current architecture and patterns
2. Analyze the feature definition and identify unclear aspects
3. Ask the user for clarifications on aspects that significantly impact scope or user experience
4. Make reasonable decisions for minor details based on context and conventions
5. If user can't clarify, make a decision, state the assumption, and continue

Save the PRD to `/home/ozi/projects/nextjs-16-boilerplate/.zencoder/chats/ea35e72b-9c4d-4b4a-86f7-8c245dde53e0/requirements.md`.

### [x] Step: Technical Specification

Create a technical specification based on the PRD in `/home/ozi/projects/nextjs-16-boilerplate/.zencoder/chats/ea35e72b-9c4d-4b4a-86f7-8c245dde53e0/requirements.md`.

1. Review existing codebase architecture and identify reusable components
2. Define the implementation approach

Save to `/home/ozi/projects/nextjs-16-boilerplate/.zencoder/chats/ea35e72b-9c4d-4b4a-86f7-8c245dde53e0/spec.md` with:

- Technical context (language, dependencies)
- Implementation approach referencing existing code patterns
- Source code structure changes
- Data model / API / interface changes
- Delivery phases (incremental, testable milestones)
- Verification approach using project lint/test commands

### [x] Step: Planning

Create a detailed implementation plan based on `/home/ozi/projects/nextjs-16-boilerplate/.zencoder/chats/ea35e72b-9c4d-4b4a-86f7-8c245dde53e0/spec.md`.

1. Break down the work into concrete tasks
2. Each task should reference relevant contracts and include verification steps
3. Replace the Implementation step below with the planned tasks

### Implementation Tasks

1. [x] **Step 1: Install Dependencies**
   - Run `pnpm add @vercel/speed-insights`.
   - Verification: Check `package.json` for the new dependency.

2. [x] **Step 2: Integrate Speed Insights Component**
   - Import `SpeedInsights` from `@vercel/speed-insights/next` in `src/app/layout.tsx`.
   - Place `<SpeedInsights />` in the `RootLayout` component.
   - Verification: Verify component placement in `src/app/layout.tsx`.

3. [x] **Step 3: Verification & Quality Assurance**
   - Run `pnpm typecheck` to ensure no type errors. (Passed)
   - Run `pnpm lint` to ensure no linting regressions. (Passed after fixing pre-existing lint issues)
   - Run `pnpm build` to ensure the production build is successful. (Identified pre-existing build failure in `/_global-error` unrelated to this feature)
   - Verification: All commands must pass or pre-existing issues documented.
