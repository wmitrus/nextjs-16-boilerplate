# Technical Specification: Clerk Authentication Integration

## Technical Context

- **Language**: TypeScript
- **Framework**: Next.js 16 (App Router)
- **Authentication**: Clerk (`@clerk/nextjs`)
- **Testing**: Vitest (Unit/Integration), Playwright (E2E)

## Implementation Approach

### 1. Dependencies

- Install `@clerk/nextjs@latest`.

### 2. Environment Variables

- Update `.env.example` with Clerk placeholders.
- Instructions for the user to add real keys to `.env.local`.

### 3. Global Proxy (`src/proxy.ts`)

- Integrate `clerkMiddleware()` into `src/proxy.ts`.
- Since `src/proxy.ts` currently uses a named export `proxy` and a `config`, I will wrap the existing logic within `clerkMiddleware`.
- **Note**: Clerk recommends `export default clerkMiddleware()`. I will check if Next.js 16 `proxy.ts` supports default export or if I should keep the `proxy` named export but call Clerk inside it.
- **Decision**: Follow Clerk's `export default clerkMiddleware()` but incorporate existing rate-limiting logic.

### 4. Root Layout (`src/app/layout.tsx`)

- Wrap the tree with `ClerkProvider`.
- Add a header containing:
  - `SignedIn`: Shows `UserButton`.
  - `SignedOut`: Shows `SignInButton` and `SignUpButton`.

### 5. Testing Strategy

- **Unit Tests**:
  - Update `src/proxy.test.ts` to mock Clerk and ensure rate limiting still works.
- **Integration Tests**:
  - Create a test for the Header component (if extracted) or the layout to ensure Clerk components are rendered correctly (mocked).
- **E2E Tests**:
  - Create `e2e/auth.spec.ts` to test sign-in/sign-out flow (using Clerk's testing tokens if possible, or just verifying presence of buttons).

## Source Code Structure Changes

- `src/proxy.ts`: Modified to use `clerkMiddleware`.
- `src/app/layout.tsx`: Modified to include `ClerkProvider` and Auth UI.
- `src/core/env.ts`: Update to include Clerk environment variables (using T3-Env).

## Delivery Phases

1. **Phase 1: Setup & Middleware**: Install deps, setup env schema, and implement `clerkMiddleware`.
2. **Phase 2: UI Integration**: Update layout with `ClerkProvider` and Auth UI components.
3. **Phase 3: Verification**: Implement and run all tests.

## Verification Approach

- `pnpm typecheck`
- `pnpm lint`
- `pnpm test` (Unit/Integration)
- `pnpm e2e` (E2E)
