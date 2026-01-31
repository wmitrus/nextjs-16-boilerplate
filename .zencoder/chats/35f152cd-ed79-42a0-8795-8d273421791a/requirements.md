# Requirements - Error Handling & Response Service

## 1. Overview

Standardize API responses and error handling across the application, providing both client-side and server-side error boundaries for the Next.js App Router.

## 2. Goals

- **Consistent API Response Shapes**: All API responses (Route Handlers and Server Actions) must follow a predictable JSON structure.
- **Structured Error Handling**: Implement a robust mechanism for mapping errors to user-friendly messages while retaining technical details for debugging (correlation IDs).
- **Clear UI Feedback**: Provide a reusable `ErrorAlert` component and error boundaries (Global and Segment-level) to handle unexpected failures gracefully.
- **Production Safety**: Ensure internal error details are hidden in production to prevent information leakage.

## 3. Functional Requirements

### API Response Service

- Helper functions for creating success, validation error, server error, and redirect responses.
- Each response must include a `status` field (`ok`, `form_errors`, `server_error`, `redirect`).

### Server-Side Error Handling

- **Route Handlers**: A higher-order function (`withErrorHandler`) to wrap handlers, catch errors, log them with correlation IDs, and return standardized responses.
- **Server Actions**: A higher-order function (`withActionHandler`) to wrap actions, returning an `ApiResponse` object instead of throwing (for better client-side handling).
- **Custom AppError**: A specialized error class to carry status codes, error codes, and validation details.

### Client-Side Error Handling

- **Global Error Handlers**: Listeners for unhandled rejections and global errors.
- **Error Boundaries**: Root-level (`global-error.tsx`) and segment-level (`error.tsx`) boundaries.
- **ErrorAlert Component**: A UI component that displays error messages, codes, and allows copying correlation IDs.

## 4. Technical Constraints

- Must be compatible with **Next.js 16** and **React 19**.
- Use **TypeScript** for type safety.
- Follow the existing project structure (`src/shared`, `src/app`, `src/core`).
- Use the existing `logger` for server-side logging.

## 5. Verification Requirements

- Unit tests for all library helpers and UI components.
- Integration tests for Route Handlers and Server Actions.
- E2E tests for error boundaries and `ErrorAlert` interaction.
- All tests must pass, including those currently failing due to environment mocking issues.
