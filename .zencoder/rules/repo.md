---
description: Repository Information Overview
alwaysApply: true
---

# temp-nextjs-scaffold Information

## Summary
This is a modern **Next.js 16** boilerplate project bootstrapped with `create-next-app`. It features a lean setup with **React 19**, **TypeScript**, and **Tailwind CSS 4**, following the **Next.js App Router** architecture.

## Structure
- **src/app**: Core application logic using the Next.js App Router. Contains routes, layouts, and global styles.
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

## Dependencies
**Main Dependencies**:
- **next**: 16.1.4
- **react**: 19.2.3
- **react-dom**: 19.2.3

**Development Dependencies**:
- **tailwindcss**: ^4
- **eslint**: ^9
- **typescript**: ^5
- **@types/node**: ^20
- **@types/react**: ^19
- **@types/react-dom**: ^19

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
