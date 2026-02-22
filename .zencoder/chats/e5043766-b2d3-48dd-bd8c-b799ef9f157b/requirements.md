# Product Requirements Document: Comprehensive Error Handling

## Overview

Build a robust error handling system that comprehensively handles:

1. **Unhandled promise rejections** in event handlers and async operations
2. **Hydration mismatches** preventing SSR/CSR inconsistencies
3. **Router initialization errors** during navigation
4. **Error boundaries** with proper fallback UI and recovery
5. **Global error listeners** with Sentry integration

## Current Issues

### Problem 1: Unhandled Promise Rejections

- Error thrown in `sentry-example-page/page.tsx` line 101 inside `onClick` handler
- Error logs show: `"Unhandled Promise Rejection"` even though GlobalErrorHandlers exists
- Root cause: Async click handlers don't have try-catch wrapping, promises reject and aren't caught by error boundaries
- Evidence: Console shows both the error and the log entry

### Problem 2: Hydration Mismatches

- Error on `/sentry-example-page` route
- Caused by `typeof window !== 'undefined'` branch in component state initialization
- State values (`isDev`, `isConnected`) differ between server and client rendering
- Root cause: Direct checks in render logic without proper hydration guards

### Problem 3: Router Initialization Errors

- "Router action dispatched before initialization" error
- Triggered by hydration mismatch cascading to Next.js router
- Prevents proper navigation and page recovery

## Goals

### Primary Goals

1. **Eliminate unhandled promise rejections** in event handlers by providing safe async wrapper utilities
2. **Prevent hydration mismatches** using hydration-aware state patterns
3. **Ensure error boundaries** properly catch and display all error types
4. **Maintain Sentry integration** while preventing duplicate error reporting
5. **Provide developer-friendly patterns** for consistent error handling across the app

### Secondary Goals

- Create reusable hook utilities for safe async operations
- Document hydration-safe patterns for server-aware components
- Add comprehensive error handling examples (replace current sentry-example-page)
- Ensure all errors are properly logged to both local logger and Sentry
- Support environment-specific error handling (dev vs production)

## Scope

### In Scope

- Create `useAsyncHandler` hook for safe async event handler wrapping
- Create `useHydrationSafeState` hook for SSR/CSR consistent state
- Enhance GlobalErrorHandlers with better error deduplication
- Update error.tsx and global-error.tsx with improved UX
- Fix sentry-example-page to demonstrate proper error handling
- Create comprehensive tests for all new utilities
- Update ErrorAlert component if needed
- Add JSDoc documentation to all utilities

### Out of Scope

- Changes to Sentry configuration (already properly set up)
- Changes to logging infrastructure (pino/logflare already working)
- UI redesign beyond error display improvements
- Performance profiling beyond error handling

## Requirements

### Functional Requirements

#### FR1: Safe Async Handler Utility

- Create `useAsyncHandler` hook that:
  - Wraps async functions to catch rejections
  - Logs errors to both logger and Sentry
  - Prevents multiple simultaneous calls (debouncing optional)
  - Returns loading state if needed
  - Supports error callbacks for UI feedback
  - Works with React event handlers

#### FR2: Hydration-Safe State Hook

- Create `useHydrationSafeState` hook that:
  - Returns consistent value during SSR and client render
  - Prevents hydration mismatches from window checks
  - Supports initial value computation without side effects
  - Works with async initialization (without blocking render)
  - Auto-skips effect on mount if value already matches

#### FR3: Enhanced Global Error Handlers

- Improve existing GlobalErrorHandlers component:
  - Deduplicate identical errors within time window
  - Track error frequency to avoid log spam
  - Better separation of error vs rejection handling
  - Support for error context/metadata attachment
  - Automatic Sentry breadcrumbs for debugging

#### FR4: Error Boundary Improvements

- Update error.tsx (route-level):
  - Show error digest for debugging
  - Provide contextual recovery options
  - Better styling and UX
- Update global-error.tsx (critical):
  - Ensure it doesn't have hydration issues
  - Proper error logging
  - User-friendly messaging

#### FR5: Sentry Example Fix

- Fix `sentry-example-page/page.tsx`:
  - Remove hydration mismatch issues
  - Use `useAsyncHandler` for throw button
  - Properly handle connectivity checks
  - Demonstrate best practices

### Non-Functional Requirements

#### NF1: Code Quality

- All new code must pass `pnpm typecheck` and `pnpm lint`
- TypeScript strict mode compliance
- Follow existing code patterns and conventions

#### NF2: Testing

- Unit tests for all new hooks and utilities
- Integration test for GlobalErrorHandlers
- E2E test for error boundary (already exists)
- Min 80% coverage on error handling code

#### NF3: Documentation

- JSDoc comments on all public functions/hooks
- Usage examples in hook comments
- README or documentation file explaining patterns

#### NF4: Performance

- No performance degradation
- Efficient error deduplication (in-memory set, auto-clear)
- Minimal re-renders from error state changes

#### NF5: Browser Compatibility

- Works in all modern browsers (Chrome, Firefox, Safari, Edge)
- Graceful degradation if window object unavailable

## Technical Details

### Architecture Decisions

**Hook-based utilities**: Use custom hooks for async handlers and hydration-safe state to integrate seamlessly with React and Next.js patterns.

**Global listeners remain**: Keep event listeners in GlobalErrorHandlers for true unhandled errors, but add hook-level catching to prevent them in the first place.

**Sentry deduplication**: Implement in hooks (via `useAsyncHandler`) rather than Sentry config to have more context.

**No middleware changes**: Focus on client-side improvements; server-side error handling is working correctly.

### Dependencies

- Existing: React, Next.js, Sentry SDK, pino logger
- No new dependencies needed

### Files to Create/Modify

Create:

- `src/shared/hooks/useAsyncHandler.ts` + test
- `src/shared/hooks/useHydrationSafeState.ts` + test
- `src/shared/components/error/error-handler-utils.ts` (helper functions) + test

Modify:

- `src/shared/components/error/global-error-handlers.tsx`
- `src/app/error.tsx`
- `src/app/global-error.tsx`
- `src/app/sentry-example-page/page.tsx`
- `src/shared/components/ErrorAlert.tsx` (if needed)

## Success Criteria

1. ✅ No unhandled promise rejections in browser console
2. ✅ No hydration mismatch errors on any page
3. ✅ Router initialization errors resolved
4. ✅ All errors properly logged to Sentry with context
5. ✅ Error boundaries recover gracefully
6. ✅ `pnpm typecheck` passes
7. ✅ `pnpm lint` passes
8. ✅ New tests pass and maintain coverage
9. ✅ No breaking changes to existing error handling

## Definition of Done

- Code complete and tested
- All new utilities have comprehensive JSDoc
- Integration tests pass
- E2E tests pass
- No console errors in dev mode
- Sentry example page works without errors
- Code review completed
- Documentation updated
