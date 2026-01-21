# Technical Specification - TypeScript, ESLint, and Prettier Setup

## Technical Context
- **Framework**: Next.js 16.1.4 (App Router)
- **Language**: TypeScript 5
- **Linting**: ESLint 9 (Flat Config)
- **Formatting**: Prettier 3
- **Styling**: Tailwind CSS 4

## Directory Structure Analysis
The proposed structure:
- `src/features`: Encapsulates domain logic.
- `src/shared`: Reusable cross-cutting concerns.
- `src/core`: Foundation of the application.

**Decision**: Keep `src/app` for the App Router to maintain Next.js conventions while using `src/features`, `src/shared`, and `src/core` for organized logic. This structure is highly compatible with Next.js 16 and supports scalability.

## Implementation Approach

### 1. TypeScript Setup
- **Config**: Update `tsconfig.json` with `strict: true`, `noEmit: true`, and `incremental: true`.
- **Aliases**:
  - `@/features/*` -> `./src/features/*`
  - `@/shared/*` -> `./src/shared/*`
  - `@/core/*` -> `./src/core/*`
  - `@/app/*` -> `./src/app/*` (already existing as `@/*`)

### 2. ESLint 9 Setup
- **File**: `eslint.config.mjs`.
- **Dependencies**: Install `eslint-plugin-jsx-a11y`, `eslint-plugin-import`, `typescript-eslint`.
- **Configuration**:
  - Use `FlatCompat` if necessary for legacy plugins.
  - Apply `next/core-web-vitals` and `next/typescript`.
  - Add custom rules for import sorting and accessibility.

### 3. Prettier Setup
- **File**: `.prettierrc.json` and `.prettierignore`.
- **Dependencies**: Install `prettier`, `prettier-plugin-tailwindcss`, `eslint-config-prettier`.
- **Integration**: Disable ESLint rules that conflict with Prettier.

## Delivery Phases
1. **Phase 1: Infrastructure**: Update `package.json`, install dependencies, and configure TypeScript aliases.
2. **Phase 2: Linting & Formatting**: Configure ESLint 9 and Prettier.
3. **Phase 3: Directory Structure**: Create the new directories and update aliases.
4. **Phase 4: Documentation**: Create `docs/features/setup.md` and update `README.md`.

## Verification Approach
- `pnpm typecheck`: Ensure zero TypeScript errors.
- `pnpm lint`: Ensure zero linting errors.
- Manual verification of Tailwind class sorting in a JSX file.
