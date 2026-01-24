# Full SDD workflow

## Workflow Steps

### [x] Step: Requirements

Create a Product Requirements Document (PRD) based on the feature description. (Updated for Storybook 10 + Vite)

Save the PRD to `/home/ozi/projects/nextjs-16-boilerplate/.zencoder/chats/b03a950b-312f-4cfe-94c4-0e0a5574a326/requirements.md`.

### [x] Step: Technical Specification

Create a technical specification based on the PRD. (Updated for Storybook 10 + Vite)

Save to `/home/ozi/projects/nextjs-16-boilerplate/.zencoder/chats/b03a950b-312f-4cfe-94c4-0e0a5574a326/spec.md`.

### [x] Step: Planning

Create a detailed implementation plan. (Updated for Storybook 10 + Vite)

### [ ] Step: Implementation

#### [x] 1. Run Official Initialization Script

- Provide the user with the `pnpm create storybook@latest` command.
- **Verification**: `package.json` contains Storybook dependencies and scripts.

#### [x] 2. Configure for Next.js + Vite

- Run `pnpm exec playwright install chromium --with-deps` after installation complete.
- Optionaly run `storybook dev -p 6006 --initial-path=/onboarding --quiet` for onboarding session.
- Update `.storybook/preview.ts` to import `src/app/globals.css`.

- **Verification**: Files exist and contain correct configuration.

#### [x] 3. Create Example Component (Button)

- Create `src/shared/components/Button/Button.tsx`.
- Create `src/shared/components/Button/Button.stories.tsx`.
- Create `src/shared/components/Button/Button.test.tsx`.
- **Verification**: `pnpm test` passes for the new component.

#### [x] 4. Final Verification

- Run `pnpm lint` and `pnpm typecheck`.
- **Verification**: No errors reported.
