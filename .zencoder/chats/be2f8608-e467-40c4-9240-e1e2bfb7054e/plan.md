# Plan: Clerk Authentication Integration

## Phase 1: Setup & Middleware

- [x] Install `@clerk/nextjs`
  - **Verification**: Check `package.json` and `pnpm-lock.yaml`.
- [x] Update `src/core/env.ts` and `.env.example` with Clerk variables
  - **Verification**: `pnpm typecheck` should pass.
- [x] Integrate `clerkMiddleware()` in `src/proxy.ts`
  - **Verification**: `pnpm typecheck` and `pnpm lint` should pass.
- [x] Update `src/proxy.test.ts` to mock Clerk and ensure rate limiting still works
  - **Verification**: `pnpm test src/proxy.test.ts` should pass.

## Phase 2: UI Integration

- [x] Wrap `src/app/layout.tsx` with `<ClerkProvider>`
  - **Verification**: `pnpm typecheck` should pass.
- [x] Add Auth UI components to `src/app/layout.tsx` (Header with Sign In/Up/User buttons)
  - **Verification**: `pnpm typecheck` and visually verify if possible (manual/dev server).
- [x] Create integration tests for the layout/header
  - **Verification**: `pnpm test` (new test file).

## Phase 3: E2E Testing & Final Cleanup

- [x] Create `e2e/auth.spec.ts` for authentication flow
  - **Verification**: `pnpm e2e` should pass (may need mocking or specific setup).
- [x] Run final quality checks: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm e2e`
  - **Verification**: All commands pass.
