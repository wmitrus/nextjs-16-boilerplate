---
description: Repository Information Overview
alwaysApply: true
---

# temp-nextjs-scaffold Information

## Summary

This is a modern **Next.js 16** boilerplate project bootstrapped with `create-next-app`. It features a lean setup with **React 19**, **TypeScript**, and **Tailwind CSS 4**, following the **Next.js App Router** architecture.

## Structure

- **src/app**: Core application logic using the Next.js App Router. Contains routes, layouts, and global styles.
- **src/features**: Domain-specific components, logic, and hooks.
- **src/shared**: Reusable UI components, generic hooks, and utilities.
- **src/core**: Foundational configurations, constants, and global logic.
- **public**: Static assets like icons and images.
- **root**: Configuration files for TypeScript, ESLint, PostCSS, and Next.js.

## Language & Runtime

**Language**: TypeScript  
**Version**: ^5 (TypeScript), Node.js ^20 (Minimum 20.9.0)  
**Build System**: Next.js Build (Turbopack by default)  
**Package Manager**: pnpm (indicated by `pnpm-lock.yaml`)

## Next.js 16 Development Standards

### 1. Async Dynamic APIs

Next.js 16 requires dynamic APIs to be accessed asynchronously. Always `await` the following:

- `params` and `searchParams` in layouts, pages, and metadata.
- `cookies()`, `headers()`, and `draftMode()`.

### 2. Cache Components & PPR

The project uses the **Cache Components** model (`cacheComponents: true` in `next.config.ts`).

- Use the `"use cache"` directive to explicitly opt-in to caching for components, functions, or pages.
- Partial Prerendering (PPR) is enabled by default with Cache Components; use `<Suspense>` to define dynamic boundaries.

### 3. React Compiler

**React Compiler** is enabled (`reactCompiler: true`).

- Manual memoization (`useMemo`, `useCallback`, `memo`) is generally unnecessary and should be avoided unless the compiler cannot optimize a specific pattern.
- Ensure `babel-plugin-react-compiler` is maintained in `devDependencies`.

### 4. Middleware vs Proxy

- Use `proxy.ts` (Node.js runtime) for request interception and network boundary logic.
- `middleware.ts` is deprecated for Node.js use cases and should only be used if the Edge runtime is strictly required.

### 5. Caching APIs

- **`revalidateTag(tag, 'max')`**: Use for Stale-While-Revalidate (SWR) behavior.
- **`updateTag(tag)`**: Use in Server Actions for "read-your-writes" semantics (immediate refresh).
- **`refresh()`**: Use in Server Actions to refresh uncached data only.

### 6. Performance

- **Turbopack**: Default bundler for dev and build.
- **Filesystem Caching**: Enabled for dev restarts via `turbopackFileSystemCacheForDev`.

### 7. Linting & Formatting

- **ESLint 9**: Uses Flat Config (`eslint.config.mjs`) with `next/core-web-vitals` and `next/typescript`.
- **JSON Linting**: Fully integrated via `eslint-plugin-jsonc` for red underlines in JSON/JSONC files.
- **Prettier**: Integrated into ESLint with `prettier-plugin-tailwindcss` for class sorting.
- **Import Sorting**: Automatically enforced via `eslint-plugin-import`.
- **Validation**: Use `pnpm typecheck` for types and `pnpm lint` for code quality.
- **VS Code**: Configured in `.vscode/settings.json` to automatically fix and format on save (supports TS, JS, and JSON).

### 8. Conventional Commits

- Use `pnpm commit` (aliased to `cz`) for creating standardized, machine-readable commit messages.
- The `commit-msg` hook validates all commits against the Conventional Commits specification.

### 9. Git Hooks & Quality Gates

- **Husky**: Manages git hooks for local quality assurance.
- **pre-commit**: Automatically runs `lint-staged` to format and lint changed files.
- **pre-push**: Enforces a full quality suite: `typecheck`, `skott:check:only` (circular dependencies), `depcheck` (unused packages), and `madge` (circular dependencies).
- **Mandatory Compliance**: Every agent must ensure `pnpm typecheck` and `pnpm lint` pass without errors for all created or modified files before concluding a task.

## Documentation Standards

- **Feature Docs**: All new features must be documented in `docs/features/`.
- **Naming Convention**: Use the format `XX - Feature Name.md` (e.g., `01 - Next.js 16 Readiness.md`).
- **Standardized Content**: Follow the existing patterns for Purpose, High-level behavior, Implementation, and Usage.

## TypeScript Configuration

- **Strict Mode**: Enforced in `tsconfig.json`.
- **Path Aliases**:
  - `@/features/*`: Maps to `src/features/*`
  - `@/shared/*`: Maps to `src/shared/*`
  - `@/core/*`: Maps to `src/core/*`
  - `@/*`: Maps to `src/*`

## Quality Tools & Commands

- **`pnpm typecheck`**: Runs TypeScript compiler in no-emit mode.
- **`pnpm skott:check:only`**: Analyzes the dependency graph and detects circular dependencies.
- **`pnpm depcheck`**: Scans for unused or missing dependencies.
- **`pnpm madge`**: Specialized circular dependency detection for the `src` directory.

## Dependencies

**Main Dependencies**:

- **next**: 16.1.4
- **react**: 19.2.3
- **react-dom**: 19.2.3

**Development Dependencies**:

- **tailwindcss**: ^4
- **eslint**: ^9
- **prettier**: ^3
- **typescript**: ^5

## Build & Installation

```bash
# Install dependencies
pnpm install

# Run development server
pnpm dev

# Build for production
pnpm build

# Start production server
pnpm start

# Type checking
pnpm typecheck

# Linting
pnpm lint
```

## Main Files & Resources

- **src/app/page.tsx**: Main entry point for the homepage.
- **src/app/layout.tsx**: Root layout component.
- **next.config.ts**: Next.js configuration.
- **eslint.config.mjs**: ESLint flat configuration.
- **tsconfig.json**: TypeScript configuration.
- **tailwind.config.mjs**: PostCSS/Tailwind configuration.

## Project Structure

- **src/**: Application source code.
- **public/**: Static public assets.
- **package.json**: Project manifest and scripts.
- **pnpm-lock.yaml**: Dependency lockfile.
