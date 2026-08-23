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

## Security Hardening (SEC-37, SEC-38, SEC-45)

Three properties of this layer are enforced rather than conventional.

### Client exposure is a type decision, not a substring match (SEC-37)

`createSecureAction()` used to return any unclassified exception's message to
the client, filtered only by `.includes('Failed query:')`. That is an
allowlist written as a denylist: every message the filter did not happen to
recognise was disclosed, including driver output and stack context.

Exposure is now a property of the error's **type** — `PublicError` carries
`exposeToClient = true`; everything else surfaces as a generic message plus a
correlation id the operator can use to find the real one in the logs.

### The response service is mandatory, and a test enforces it (SEC-38)

`response-service.guard.test.ts` walks every `route.ts` under `src/app/api`
and fails the suite if one builds a response by hand.

This wording used to say "prefer". Twelve of thirty-six routes did not follow
it, including five live auth endpoints — **advice that nothing checks is
advice that decays**. That lesson is why SEC-23, SEC-42, SEC-43 and SEC-44
each ship with a static guard rather than a paragraph.

Full detail: SEC-37 and SEC-38 in `docs/ai/general/SECURITY_CODING_PATTERNS.md`.

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

### The Edge error boundary uses this service too (SEC-45)

`createServerErrorResponse('Internal Server Error', 500, 'SERVER_ERROR')` is
what `withSecurity` returns when the Edge pipeline throws — the failure path in
`src/proxy.ts` no longer hand-assembles its own `NextResponse.json()`.

Two consequences worth knowing when changing this module:

- **`ServerErrorResponse` is now also the Edge contract.** Adding a field to
  the type widens every error response in the application _and_ the middleware
  boundary. This is why the correlation id for a thrown request travels in
  `x-correlation-id` / `x-request-id` headers rather than in the JSON body.
- **The Edge boundary is generic in every environment**, unlike
  `with-error-handler.ts`, which returns `error.message` outside production.
  That asymmetry is deliberate: the route wrapper runs behind auth on a known
  handler, while the middleware boundary runs before any authorization and can
  catch a throw from any library in the chain.

Full rationale: SEC-45 in `docs/ai/general/SECURITY_CODING_PATTERNS.md`.
