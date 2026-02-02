# PRD: Clerk Authentication Integration

## Purpose

Integrate Clerk into the Next.js 16 boilerplate to provide secure and modern authentication.

## Scope

- Setup Clerk Next.js SDK.
- Configure environment variables.
- Implement Clerk middleware in `src/proxy.ts`.
- Wrap the application with `ClerkProvider`.
- Add basic authentication UI (Sign In, Sign Up, User Button) to the root layout.
- Implement comprehensive testing (Unit, Integration, E2E).

## User Requirements

- Users should be able to sign up and sign in using Clerk.
- Authenticated users should see their profile via the `UserButton`.
- Unauthenticated users should see "Sign In" and "Sign Up" buttons.
- The application should enforce authentication middleware where necessary (though by default it might be open).

## Technical Requirements

- **Next.js Version**: 16 (App Router).
- **Clerk SDK**: `@clerk/nextjs` (latest).
- **Middleware**: Use `clerkMiddleware()` in `src/proxy.ts`.
- **Async APIs**: Ensure `auth()` and other dynamic APIs are awaited.
- **Security**: Never commit real API keys; use placeholders in documentation and `.env.local` for local development.
- **Testing**:
  - Unit tests for middleware/utility logic.
  - Integration tests for Clerk-wrapped components.
  - E2E tests for the auth flow (using Playwright).

## Constraints

- Follow the provided "Add Clerk to Next.js App Router" guide strictly.
- Maintain existing project patterns (e.g., `src/proxy.ts` for rate limiting).
- Do not use deprecated `authMiddleware`.
- Use `src` directory for all implementation files.
