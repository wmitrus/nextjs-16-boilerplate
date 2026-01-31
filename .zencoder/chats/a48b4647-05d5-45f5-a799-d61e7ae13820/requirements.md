# Product Requirements Document (PRD) - Standardized API Responses

## Purpose

The goal is to implement a unified API response and error handling system for the Next.js 16 boilerplate. This system will ensure consistency across all API endpoints, improve type safety, and simplify client-side handling of API responses.

## User Stories

- As a developer, I want a consistent way to return success and error responses from the server so that I don't have to reinvent the response structure for every endpoint.
- As a developer, I want full type safety when consuming API responses on the client so that I can catch potential errors at compile time.
- As a developer, I want a global error handler that catches unhandled exceptions and returns a standardized JSON response instead of a generic 500 HTML page.
- As a developer, I want to easily handle form validation errors with a specific structure that can be directly mapped to UI components.

## Requirements

### 1. Standardized JSON Contract

All API responses must follow this structure:

```json
{
  "status": "ok | form_errors | server_error | redirect",
  "data": "T",
  "errors": "Record<string, string[]> (optional)",
  "error": "string (optional)",
  "url": "string (optional)"
}
```

### 2. Status Definitions

- `ok`: Success response. Contains the requested `data`.
- `form_errors`: Validation failures. Contains an `errors` object mapping field names to error messages.
- `server_error`: Unexpected server failure or specific business logic error. Contains an `error` message.
- `redirect`: Instructs the client to navigate to another `url`.

### 3. Server-side Response Service

- A utility to generate `NextResponse` objects with the correct status codes and JSON structure.
- Helpers like `createSuccessResponse`, `createValidationErrorResponse`, `createServerErrorResponse`, and `createRedirectResponse`.

### 4. Client-side Response Handler

- A utility to process the discriminated union of responses.
- Provides a simplified interface for components to check for success, validation errors, or server errors.

### 6. Business and Database Error Handling

- Support for mapping database errors (e.g., unique constraint violations, not found) to standardized responses.
- Ability to throw "Expected" errors from business logic that the global handler can catch and format.
- Generic fallback for unexpected system failures to avoid leaking sensitive stack traces.

## Constraints

- Must be compatible with Next.js 16 and React 19.
- Must use TypeScript for full type safety.
- Must follow the project's directory structure (`src/shared`, `src/core`, etc.).
- Must be production-ready (secure, performant, well-documented).

## Success Criteria

- All API responses from new endpoints follow the standard contract.
- TypeScript correctly narrow types based on the `status` field.
- Unhandled exceptions in API routes return a standardized JSON error response.
- `pnpm typecheck` and `pnpm lint` pass.
