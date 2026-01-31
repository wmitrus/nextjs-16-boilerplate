# Technical Specification - Error Handling & Response Service

## 1. Technical Context

- **Language**: TypeScript
- **Framework**: Next.js 16 (App Router), React 19
- **Libraries**: Vitest (Testing), Tailwind CSS 4 (UI), Winston/Pino (Logger - check `src/core/logger/server`)
- **Key Dependencies**: `next/server`, `next/headers`

## 2. Implementation Approach

The core infrastructure is partially implemented but requires refinement and bug fixes.

- **AppError refinement**: Ensure consistent usage across the codebase.
- **Server Action Handling**: Refine `withActionHandler` to ensure perfect compatibility with React 19 transitions and the `ApiResponse` type.
- **Route Handler Handling**: Fix the environment mocking issues in `withErrorHandler` tests.
- **UI Components**: Ensure `ErrorAlert` and `ClientErrorBoundary` are robust and well-tested.
- **Environment Mocking**: Implement a better strategy for mocking `process.env.NODE_ENV` in Vitest to fix the failing tests.

## 3. Source Code Structure

- `src/shared/lib/api/app-error.ts`: Base error class.
- `src/shared/lib/api/response-service.ts`: Response helpers.
- `src/shared/lib/api/with-error-handler.ts`: Wrapper for Route Handlers.
- `src/shared/lib/api/with-action-handler.ts`: Wrapper for Server Actions.
- `src/shared/components/ErrorAlert.tsx`: Error UI component.
- `src/shared/components/error/client-error-boundary.tsx`: React Error Boundary.
- `src/app/error.tsx` & `src/app/global-error.tsx`: Next.js Error Boundaries.

## 4. API & Interface Changes

- **ApiResponse type**: Ensure it's the source of truth for all API-related communication.
- **withActionHandler**: Returns `Promise<ApiResponse<T>>`.
- **withErrorHandler**: Returns `NextResponse<ApiResponse<T>>`.

## 5. Delivery Phases

1. **Infrastructure Fixes**: Fix failing tests and unify `AppError` imports.
2. **Server Action Refinement**: Ensure `withActionHandler` is production-ready.
3. **UI/UX Enhancement**: Audit `ErrorAlert` for accessibility and Tailwind 4 compliance.
4. **Final Verification**: Run full suite of tests (Unit, Integration, E2E).

## 6. Verification Approach

- **Linting**: `pnpm lint`
- **Type Checking**: `pnpm typecheck`
- **Unit Testing**: `pnpm test src/shared/lib/api/` and `pnpm test src/shared/components/error/`
- **Integration Testing**: `pnpm test:integration` (specifically for API routes)
