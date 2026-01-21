# TypeScript, ESLint, and Prettier Setup

This feature implements a robust development environment with strict type safety, advanced linting, and consistent formatting.

## Features

- **Strict TypeScript**: Configured with `strict: true` and incremental builds.
- **ESLint 9 Flat Config**: Uses the latest ESLint standards with Next.js core vitals, TypeScript support, and accessibility checks.
- **Performance Optimized**: Replaced `eslint-plugin-import` with `eslint-plugin-import-x` and tuned `projectService` for faster linting.
- **JSON Linting**: Integrated `eslint-plugin-jsonc` for full linting and red underlines in `.json` and `.jsonc` files.
- **Prettier Integration**: Unified formatting with automatic Tailwind CSS class sorting for code and standard formatting for JSON.
- **Optimized Directory Structure**:
  - `@/features/*`: Domain-specific logic.
  - `@/shared/*`: Reusable components and hooks.
  - `@/core/*`: Foundational configurations.
  - `@/app/*`: Next.js App Router (Standard).

## Usage

### Type Checking
Run TypeScript validation:
```bash
pnpm typecheck
```

### Linting & Formatting
Run ESLint (includes Prettier checks):
```bash
pnpm lint
```

## Directory Structure
The project follows a scalable architecture:
```text
src/
├── app/          # App Router
├── core/         # Foundations
├── features/     # Domain logic
└── shared/       # Reusable assets
```

## VS Code Integration

The project includes a `.vscode/settings.json` file that enables **ESLint fix on save**. This ensures that all linting errors and Prettier formatting (including Tailwind class sorting) are automatically applied whenever you save a file.

### Settings included:
- `editor.codeActionsOnSave`: Automatically runs ESLint fixes.
- `eslint.validate`: Explicitly defines which file types to validate.
- `editor.formatOnSave`: Disabled in favor of ESLint fixing to avoid conflicts.
- `[json]`/`[jsonc]`: Specifically enabled Prettier formatting on save for JSON files.
