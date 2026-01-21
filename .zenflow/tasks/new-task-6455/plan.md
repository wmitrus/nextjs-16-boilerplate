# Full SDD workflow

## Configuration
- **Artifacts Path**: {@artifacts_path} → `.zenflow/tasks/{task_id}`

---

## Workflow Steps

### [x] Step: Requirements
<!-- chat-id: 0c66d121-b2cf-4f30-83c6-0060cfd403ad -->

Create a Product Requirements Document (PRD) based on the feature description.

1. Review existing codebase to understand current architecture and patterns
2. Analyze the feature definition and identify unclear aspects
3. Ask the user for clarifications on aspects that significantly impact scope or user experience
4. Make reasonable decisions for minor details based on context and conventions
5. If user can't clarify, make a decision, state the assumption, and continue

Save the PRD to `{@artifacts_path}/requirements.md`.

### [x] Step: Technical Specification
<!-- chat-id: 8ce402d8-c5dd-49b9-a226-babb8b8986fb -->

Create a technical specification based on the PRD in `{@artifacts_path}/requirements.md`.

1. Review existing codebase architecture and identify reusable components
2. Define the implementation approach

Save to `{@artifacts_path}/spec.md` with:
- Technical context (language, dependencies)
- Implementation approach referencing existing code patterns
- Source code structure changes
- Data model / API / interface changes
- Delivery phases (incremental, testable milestones)
- Verification approach using project lint/test commands

### [x] Step: Planning
<!-- chat-id: 906cf0e8-cf66-43ea-b9b0-df382c69f37b -->

Create a detailed implementation plan based on `{@artifacts_path}/spec.md`.

1. Break down the work into concrete tasks
2. Each task should reference relevant contracts and include verification steps
3. Replace the Implementation step below with the planned tasks

Rule of thumb for step size: each step should represent a coherent unit of work (e.g., implement a component, add an API endpoint, write tests for a module). Avoid steps that are too granular (single function) or too broad (entire feature).

If the feature is trivial and doesn't warrant full specification, update this workflow to remove unnecessary steps and explain the reasoning to the user.

Save to `{@artifacts_path}/plan.md`.

### [x] Step: Pre-execution Environment Checks
<!-- chat-id: 820fd411-f5de-4918-8261-bcd825952775 -->

Verify that the environment meets Next.js 16 requirements before scaffolding.

**Actions**:
- Check Node.js version (must be 18.17+)
- Check pnpm is installed
- Verify current directory contents

**Verification**: Commands execute successfully, versions meet requirements

**Reference**: spec.md "Pre-execution Checks" section

---

### [x] Step: Execute Scaffolding Command
<!-- chat-id: be8ba9d5-a2e6-4b8c-bfe8-01084ce291d6 -->

Run the official `create-next-app` command with all required flags.

**Actions**:
- Execute: `pnpm create next-app@latest . --typescript --eslint --tailwind --src-dir --app --import-alias "@/*"`
- Monitor command output for errors
- Wait for completion and dependency installation

**Verification**: Command completes successfully, project files are generated

**Reference**: spec.md "Phase 1: Scaffolding"

---

### [x] Step: Verify Project Structure
<!-- chat-id: 91940628-914f-46f1-b504-eef2e19eb1da -->

Confirm all expected directories and files were created.

**Actions**:
- Check `src/app/` directory exists
- Check `public/` directory exists
- Verify configuration files: `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `eslint.config.mjs`
- Verify `pnpm-lock.yaml` exists
- Verify `.gitignore` includes: node_modules, .next, dist, build

**Verification**: All key files and directories present

**Reference**: spec.md "Source Code Structure"

---

### [x] Step: Verify TypeScript Configuration
<!-- chat-id: 5edb0d6b-34df-41e4-8638-e3d22e0d49e9 -->

Ensure TypeScript is configured with strict mode and proper path aliases.

**Actions**:
- Read `tsconfig.json`
- Confirm `"strict": true` is set
- Confirm `"@/*": ["./src/*"]` path mapping exists
- Run: `pnpm exec tsc --noEmit` to check for type errors

**Verification**: TypeScript config meets requirements, no type errors

**Reference**: spec.md "TypeScript Verification"

---

### [x] Step: Verify ESLint Configuration
<!-- chat-id: 4c94be51-24e2-4d55-8dcf-ffece443951f -->

Confirm ESLint is properly configured for Next.js and TypeScript.

**Actions**:
- Verify `eslint.config.mjs` exists
- Run: `pnpm lint`

**Verification**: ESLint runs without errors

**Reference**: spec.md "ESLint Verification"

---

### [x] Step: Test Development Server

Start the development server and verify it runs successfully.

**Actions**:
- Run: `pnpm dev` (in background or with timeout)
- Verify server starts on http://localhost:3000
- Check for runtime errors in console

**Verification**: Server starts successfully, no errors

**Reference**: spec.md "Development Server Verification"

---

### [x] Step: Test Production Build

Create a production build to ensure the project builds without errors.

**Actions**:
- Run: `pnpm build`
- Verify build completes successfully
- Confirm `.next` directory is generated

**Verification**: Build succeeds with no TypeScript or build errors

**Reference**: spec.md "Build Verification"

---

### [x] Step: Final Verification & Success Criteria

Complete final checklist and confirm all requirements are met.

**Actions**:
- Review success criteria checklist from spec.md
- Mark all criteria as complete
- Document any deviations or issues

**Verification**: All success criteria from spec.md are satisfied

**Reference**: spec.md "Success Criteria Checklist"
