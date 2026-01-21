# Technical Specification - Next.js 16 Readiness

## Technical Context
- **Framework**: Next.js 16.1.4
- **Runtime**: Node.js 20.9+ (Required)
- **Language**: TypeScript 5+
- **Styling**: Tailwind CSS 4

## Implementation Approach

### 1. Configuration Updates (`next.config.ts`)
Enable the following flags to opt-in to Next.js 16 features:
- `cacheComponents: true`: Enables the new Cache Components model and PPR.
- `reactCompiler: true`: Enables automatic memoization via the React Compiler.
- `experimental.turbopackFileSystemCacheForDev: true`: Speeds up development restarts.

### 2. Dependency Management
Install the React Compiler Babel plugin as required for the `reactCompiler` flag:
- `babel-plugin-react-compiler@latest`

### 3. Source Code Structure
- Although no middleware exists, we should document that `proxy.ts` is the new standard for Node.js runtime request interception.

### 4. API Compliance
- Audit `src/app` for any usage of `params` or `searchParams`.
- Audit for usage of `cookies()`, `headers()`, or `draftMode()`.
- Ensure all these are accessed as `await`ed promises.

## Delivery Phases

### Phase 1: Configuration and Dependencies
- Update `next.config.ts`.
- Install `babel-plugin-react-compiler`.

### Phase 2: Code Audit and Migration
- Verify `src/app` components for async API usage.

### Phase 3: Verification
- Run `pnpm lint`.
- Run `pnpm build` to ensure Turbopack and React Compiler are working correctly.

## Verification Plan
- **Lint**: `pnpm lint`
- **Build**: `pnpm build` (Tests the compiler and bundler)
