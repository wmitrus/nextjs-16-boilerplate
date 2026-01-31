# Technical Specification - Standardized API Responses

## Technical Context

- **Next.js 16** (App Router)
- **TypeScript 5**
- **React 19**
- **Pino** for logging
- **Zod** (used for validation)

## Implementation Approach

### 1. Types Definitions (`src/shared/types/api-response.ts`)

We will use a discriminated union to define the possible response states.

```typescript
export type ApiStatus = 'ok' | 'form_errors' | 'server_error' | 'redirect';

export interface BaseApiResponse {
  status: ApiStatus;
}

export interface SuccessResponse<T> extends BaseApiResponse {
  status: 'ok';
  data: T;
  meta?: Record<string, unknown>;
}

export interface FormErrorsResponse extends BaseApiResponse {
  status: 'form_errors';
  errors: Record<string, string[]>;
}

export interface ServerErrorResponse extends BaseApiResponse {
  status: 'server_error';
  error: string;
  code?: string; // Optional machine-readable error code
}

export interface RedirectResponse extends BaseApiResponse {
  status: 'redirect';
  url: string;
}

export type ApiResponse<T> =
  | SuccessResponse<T>
  | FormErrorsResponse
  | ServerErrorResponse
  | RedirectResponse;

/**
 * Custom Error class for expected API errors
 */
export class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number = 400,
    public code?: string,
    public errors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
```

### 2. Response Service (`src/shared/lib/response-service.ts`)

Server-side utility to create `NextResponse` objects.

- `createSuccessResponse<T>(data: T, status = 200, meta?: Record<string, unknown>)`
- `createValidationErrorResponse(errors: Record<string, string[]>)`
- `createServerErrorResponse(message: string, statusCode = 500, code?: string)`
- `createRedirectResponse(url: string)`

### 3. Error Handler Wrapper (`src/shared/lib/with-error-handler.ts`)

A higher-order function to wrap API route handlers. It will:

- Catch unhandled exceptions.
- **AppError**: If error is `AppError`, return standardized response with `statusCode`, `code`, and `errors` if present.
- **External Errors**: For database or other external errors, log them as `error` with full stack trace, and return a generic "Internal Server Error" (500) to the client to avoid leaking internals.
- **Mapping**: Implement a mapper to transform known database errors (e.g., Prisma Unique Constraint, Mongo Duplicate Key) into `AppError` before returning.

### 4. Client Handler (`src/shared/lib/api-client-handler.ts`)

A utility to process the response on the client side.

```typescript
export function handleApiResponse<T>(response: ApiResponse<T>) {
  return {
    isOk: response.status === 'ok',
    isFormError: response.status === 'form_errors',
    isServerError: response.status === 'server_error',
    isRedirect: response.status === 'redirect',
    data:
      response.status === 'ok' ? (response as SuccessResponse<T>).data : null,
    errors:
      response.status === 'form_errors'
        ? (response as FormErrorsResponse).errors
        : null,
    error:
      response.status === 'server_error'
        ? (response as ServerErrorResponse).error
        : null,
    url:
      response.status === 'redirect'
        ? (response as RedirectResponse).url
        : null,
  };
}
```

## Source Code Structure Changes

- `src/shared/types/api-response.ts` (NEW)
- `src/shared/lib/response-service.ts` (NEW)
- `src/shared/lib/with-error-handler.ts` (NEW)
- `src/shared/lib/api-client-handler.ts` (NEW)

## Verification Approach

- **Unit Tests**: Test each utility in isolation.
- **Integration Tests**: Wrap an API route and verify the output structure for success, validation, business errors, and unexpected failures.
- **Type Checking**: Run `pnpm typecheck`.
- **Linting**: Run `pnpm lint`.
