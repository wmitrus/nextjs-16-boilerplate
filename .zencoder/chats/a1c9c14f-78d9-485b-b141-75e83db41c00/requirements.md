# Requirements - Next.js 16 Readiness

Prepare the `temp-nextjs-scaffold` project to fully leverage Next.js 16 features and ensure compliance with its architectural changes.

## Goals
1. **Enable New Features**: Opt-in to Next.js 16 specific features that improve performance and developer experience.
2. **Architectural Alignment**: Ensure the project structure follows Next.js 16 recommendations (e.g., `proxy.ts`).
3. **Performance Optimization**: Enable Turbopack optimizations and React Compiler support.
4. **Breaking Change Readiness**: Ensure code patterns (like async params) are followed, even if not currently used.

## Features to Implement
- **Cache Components**: Enable `cacheComponents` in `next.config.ts`.
- **React Compiler**: Enable `reactCompiler` and install necessary dependencies.
- **Turbopack File System Caching**: Enable `turbopackFileSystemCacheForDev`.
- **proxy.ts Support**: Ensure the project is ready for the middleware-to-proxy transition (though no middleware exists currently).
- **Async API compliance**: Ensure any future usage of `params`, `searchParams`, `cookies()`, and `headers()` follows the async pattern.

## Non-Functional Requirements
- Maintain existing Tailwind CSS 4 setup.
- Ensure project passes linting and type checking after changes.
