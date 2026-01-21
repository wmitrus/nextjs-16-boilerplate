# TypeScript, ESLint, and Prettier Setup

This feature implements a robust development environment with strict type safety, advanced linting, and consistent formatting.

## Features

- **Strict TypeScript**: Configured with `strict: true` and incremental builds.
- **ESLint 9 Flat Config**: Uses the latest ESLint standards with Next.js core vitals, TypeScript support, and accessibility checks.
- **Prettier Integration**: Unified formatting with automatic Tailwind CSS class sorting.
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

## Path Aliases
The following aliases are configured in `tsconfig.json`:
- `@/*` -> `src/*`
- `@/features/*` -> `src/features/*`
- `@/shared/*` -> `src/shared/*`
- `@/core/*` -> `src/core/*`
