# Error Handling & Response Service

## Overview

This feature standardizes API responses and error handling across the app, and provides client/server error boundaries for App Router.

Key goals:

- Consistent API response shapes
- Structured error handling for Route Handlers and Server Actions
- Clear UI feedback for client errors
- Global and segment-level error boundaries

## API Response Service

File: `src/shared/lib/api/response-service.ts`

Provides helpers to return consistent JSON responses:

- `createSuccessResponse(data, status, meta)`
- `createValidationErrorResponse(errors, status)`
- `createServerErrorResponse(message, status, code)`
- `createRedirectResponse(url, status)`

These are used by Route Handlers to ensure the response payload includes a `status` discriminator.

## API Error Handling (Route Handlers)

File: `src/shared/lib/api/with-error-handler.ts`

Wraps Route Handlers to:

- Map known `AppError` cases to `form_errors` or `server_error`
- Log errors with correlation IDs
- Hide internal error messages in production

Example usage (Route Handler):

- `src/app/api/users/route.ts`

## Server Action Error Handling

File: `src/shared/lib/api/with-action-handler.ts`

Wraps Server Actions and returns an `ApiResponse` object with:

- `status: 'ok' | 'form_errors' | 'server_error'`
- `data` or `errors` or `error`

## Client Error Handling

- Global browser listeners: `src/shared/components/error/global-error-handlers.tsx`
- Error alert UI: `src/shared/components/ErrorAlert.tsx`
- Client component boundary: `src/shared/components/error/client-error-boundary.tsx`

The `ErrorAlert` component understands `ApiClientError`, displays error details, and allows correlation ID copy.

## Error Boundaries (App Router)

- Root boundary: `src/app/error.tsx`
- Global fallback: `src/app/global-error.tsx`
- Segment boundary example: `src/app/users/error.tsx`

Error boundaries are automatically applied per route segment. Add `error.tsx` to a segment only if you want segment-specific behavior.

## E2E Test-Only Route

To validate segment boundaries in Playwright, a dedicated test-only segment is included:

- `src/app/e2e-error/page.tsx`
- `src/app/e2e-error/error.tsx`

This route intentionally throws when `?throw=1` is provided. It is gated by `NEXT_PUBLIC_E2E_ENABLED` (set in Playwright config) and is only used for E2E coverage. It can be removed if not needed.

## Tests

### Unit

- `src/shared/lib/api/*` tests for response and error handling
- `src/shared/components/error/*` tests for UI and boundary behavior

### Integration

- `src/app/api/users/route.integration.test.ts`
- `src/shared/lib/api/with-error-handler.integration.test.ts`
- `src/features/user-management/tests/user-management*.integration.test.tsx`

### E2E

- `e2e/users.spec.ts` (ErrorAlert JSON + correlation ID copy)
- `e2e/error-boundary.spec.ts` (segment error boundary)

## Commands

- Unit: `pnpm test`
- Integration: `pnpm test:integration`
- E2E: `pnpm e2e`
