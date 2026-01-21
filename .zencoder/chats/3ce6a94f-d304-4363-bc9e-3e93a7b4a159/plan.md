# Full SDD workflow

## Workflow Steps

### [x] Step: Requirements

Create a Product Requirements Document (PRD) based on the feature description.

1. Review existing codebase to understand current architecture and patterns
2. Analyze the feature definition and identify unclear aspects
3. Ask the user for clarifications on aspects that significantly impact scope or user experience
4. Make reasonable decisions for minor details based on context and conventions
5. If user can't clarify, make a decision, state the assumption, and continue

Save the PRD to `/home/ozi/projects/nextjs-16-boilerplate/.zencoder/chats/3ce6a94f-d304-4363-bc9e-3e93a7b4a159/requirements.md`.

### [x] Step: Technical Specification

Create a technical specification based on the PRD in `/home/ozi/projects/nextjs-16-boilerplate/.zencoder/chats/3ce6a94f-d304-4363-bc9e-3e93a7b4a159/requirements.md`.

1. Review existing codebase architecture and identify reusable components
2. Define the implementation approach

Save to `/home/ozi/projects/nextjs-16-boilerplate/.zencoder/chats/3ce6a94f-d304-4363-bc9e-3e93a7b4a159/spec.md` with:

- Technical context (language, dependencies)
- Implementation approach referencing existing code patterns
- Source code structure changes
- Data model / API / interface changes
- Delivery phases (incremental, testable milestones)
- Verification approach using project lint/test commands

### [x] Step: Planning

Create a detailed implementation plan based on `/home/ozi/projects/nextjs-16-boilerplate/.zencoder/chats/3ce6a94f-d304-4363-bc9e-3e93a7b4a159/spec.md`.

### [x] Step: Implementation

1. [x] **Phase 1: Dependencies & TypeScript**
   - Install required devDependencies: `eslint`, `prettier`, `prettier-plugin-tailwindcss`, `eslint-plugin-jsx-a11y`, `eslint-plugin-import`, `eslint-config-prettier`, `eslint-plugin-prettier`, `typescript-eslint`.
   - Update `tsconfig.json` with strict rules and path aliases (`@/features/*`, `@/shared/*`, `@/core/*`).
   - Create directories: `src/features`, `src/shared`, `src/core`.

2. [x] **Phase 2: ESLint 9 Flat Config**
   - Configure `eslint.config.mjs` with `next/core-web-vitals`, `next/typescript`, `jsx-a11y`, and import sorting rules.
   - Ensure it works with the latest ESLint 9 standards.

3. [x] **Phase 3: Prettier Setup**
   - Create `.prettierrc.json` with project standards and `prettier-plugin-tailwindcss`.
   - Create `.prettierignore`.
   - Integrate Prettier into ESLint.

4. [x] **Phase 4: Documentation & Finalization**
   - Create `docs/features/typescript-eslint-prettier-setup.md`.
   - Update `README.md` to include references to the new setup and structure.
   - Run `pnpm typecheck` and `pnpm lint` to verify.

