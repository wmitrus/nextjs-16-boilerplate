# Technical Specification: Comprehensive Error Handling

## Executive Summary

This specification defines the implementation approach for building a comprehensive error handling system that eliminates unhandled promise rejections, prevents hydration mismatches, and improves error boundaries. The solution uses custom React hooks and enhanced global error listeners integrated with existing Sentry and logging infrastructure.

## Technical Context

### Language & Framework

- **Language**: TypeScript 5.x (strict mode)
- **Framework**: Next.js 16 with App Router
- **React**: 19.2.3 with compiler enabled
- **Runtime**: Node.js 20+
- **Package Manager**: pnpm

### Existing Infrastructure

- **Error Logging**: Pino + Logflare (browser) + Sentry
- **Global Error Handlers**: Already implemented in `src/shared/components/error/global-error-handlers.tsx`
- **Error Boundaries**: Exist in `src/app/error.tsx` (route-level) and `src/app/global-error.tsx` (critical)
- **Sentry Integration**: Configured in `sentry.server.config.ts` and `sentry.edge.config.ts`
- **Testing**: Jest/Vitest with integration and E2E tests

### Code Patterns & Conventions

- **Path Aliases**: `@/features`, `@/shared`, `@/core`, `@/`
- **Hooks Location**: Not yet established; will create `src/shared/hooks/`
- **Error Components Location**: `src/shared/components/error/`
- **Logger Usage**: `import { logger } from '@/core/logger/client'` or `getBrowserLogger()`
- **Sentry Usage**: `import * as Sentry from '@sentry/nextjs'`
- **Testing Suffix**: `.test.ts` or `.test.tsx`
- **Co-location**: Tests live next to source files

## Implementation Approach

### Architecture

#### Component Stack

```
App Layout (root)
  ↓
ClerkProvider
  ↓
GlobalErrorHandlers (client-side event listeners)
  ↓
Router + Page Components
  ↓
ErrorBoundary (error.tsx)
  ↓
GlobalError (global-error.tsx)
```

#### Hook-Based Error Handling Flow

```
Component with async operation
  ↓
useAsyncHandler(callback, onError, onSuccess)
  ↓
Try-catch block + logging + Sentry
  ↓
User callback or error handler
```

#### Hydration-Safe State Flow

```
useHydrationSafeState(initialValue, asyncInit?)
  ↓
Return SSR-matching value immediately
  ↓
After hydration, update with client-specific value
  ↓
No hydration mismatch
```

### Design Decisions

#### 1. Hook-Based Utilities Instead of HOCs

**Why**: Hooks integrate better with functional components, reduce wrapper nesting, and are the modern React pattern used throughout this codebase.

#### 2. Deduplication in GlobalErrorHandlers

**Why**: Prevent log spam from identical errors, track error frequency, and reduce Sentry event quota usage.

**Implementation**: In-memory Map with error fingerprint keys, auto-clear after timeout.

#### 3. No Sentry Configuration Changes

**Why**: Sentry is already properly configured. The issue is at component level (unhandled promises in event handlers, not captured by global listeners).

#### 4. Hydration-Safe Pattern Using Refs

**Why**: Use React refs to detect client-side and avoid showing hydration mismatch errors. Delay window checks until after hydration.

#### 5. Global Listeners Remain

**Why**: True unhandled errors still need to be caught. Hooks prevent errors from happening in the first place; listeners catch anything that escapes.

### Source Code Structure

#### New Files to Create

```
src/shared/
├── hooks/
│   ├── useAsyncHandler.ts          // Safe async event handler wrapper
│   ├── useAsyncHandler.test.ts
│   ├── useHydrationSafeState.ts    // Hydration-safe state hook
│   └── useHydrationSafeState.test.ts
└── components/
    └── error/
        ├── error-handler-utils.ts   // Helper functions
        ├── error-handler-utils.test.ts
        └── (existing files)
```

#### Modified Files

```
src/shared/components/error/
├── global-error-handlers.tsx        // Add deduplication
└── (tests if needed)

src/app/
├── error.tsx                        // Improve UX
├── global-error.tsx                 // Fix hydration issues
└── sentry-example-page/
    └── page.tsx                     // Fix hydration, use useAsyncHandler

src/shared/components/
└── ErrorAlert.tsx                   // No changes needed (works well)
```

## API Specifications

### Hook 1: `useAsyncHandler`

```typescript
/**
 * Custom hook for safely handling async operations in event handlers.
 * Automatically catches rejections, logs errors, and sends to Sentry.
 *
 * @template T - The async function's return type
 * @template E - Custom error type (defaults to Error)
 *
 * @param callback - Async function to execute
 * @param options - Configuration options
 * @param options.onError - Callback invoked on error
 * @param options.onSuccess - Callback invoked on success
 * @param options.preventDuplicates - Prevent overlapping calls (default: true)
 *
 * @returns Object with handler function, loading state, and error state
 *
 * @example
 * const { handler, isLoading, error } = useAsyncHandler(
 *   async () => await api.submit(data),
 *   {
 *     onSuccess: () => setShowMessage(true),
 *     onError: (err) => setErrorMsg(err.message)
 *   }
 * );
 *
 * return <button onClick={handler} disabled={isLoading}>Submit</button>;
 */
function useAsyncHandler<T>(
  callback: () => Promise<T>,
  options?: {
    onError?: (error: Error) => void;
    onSuccess?: (result: T) => void;
    preventDuplicates?: boolean;
  },
): {
  handler: () => void;
  isLoading: boolean;
  error: Error | null;
};
```

**Key Implementation Details**:

- Wraps async function in try-catch
- Logs errors with context via Pino logger
- Sends errors to Sentry automatically
- Returns `{ handler, isLoading, error }` object
- Prevents concurrent executions when `preventDuplicates=true`
- Uses refs to track loading state without extra renders
- Auto-clears error after 5 seconds or on next call

### Hook 2: `useHydrationSafeState`

```typescript
/**
 * Custom hook that prevents hydration mismatches by maintaining
 * server-safe initial state across SSR and client render.
 *
 * Useful for state that depends on `typeof window` checks or
 * client-only features (localStorage, Date.now, etc).
 *
 * @template T - The state value type
 *
 * @param initialValue - Value to use during SSR and initial render
 * @param asyncInit - Optional async function to compute client value
 *
 * @returns Tuple of [state, setState] like useState
 *
 * @example
 * // Basic usage with client-specific value
 * const [isDarkMode] = useHydrationSafeState(
 *   false, // SSR value
 *   async () => (await localStorage.getItem('darkMode')) === 'true'
 * );
 *
 * @example
 * // With state update
 * const [isOnline, setIsOnline] = useHydrationSafeState(true);
 * useEffect(() => {
 *   const handler = () => setIsOnline(navigator.onLine);
 *   window.addEventListener('online', handler);
 *   window.addEventListener('offline', handler);
 *   return () => {
 *     window.removeEventListener('online', handler);
 *     window.removeEventListener('offline', handler);
 *   };
 * }, []);
 */
function useHydrationSafeState<T>(
  initialValue: T,
  asyncInit?: () => Promise<T>,
): [T, (value: T | ((prev: T) => T)) => void];
```

**Key Implementation Details**:

- Returns `initialValue` during SSR (no state mismatch)
- Uses ref to detect first client render
- Calls `asyncInit` on first client render if provided
- Updates state without forcing re-render during hydration
- No external data fetching; only computation-based initialization
- Prevents `typeof window !== 'undefined'` mismatch errors

### Helper Functions: `error-handler-utils.ts`

```typescript
/**
 * Create a fingerprint for error deduplication
 * @param error - The error object
 * @returns Unique identifier for this error
 */
function getErrorFingerprint(error: Error): string;

/**
 * Format error context for logging
 * @param error - The error object
 * @param context - Additional context
 * @returns Formatted error context object
 */
function formatErrorContext(
  error: Error,
  context?: Record<string, unknown>,
): Record<string, unknown>;

/**
 * Check if error should be reported to Sentry
 * @param error - The error to check
 * @returns true if error should be reported
 */
function shouldReportToSentry(error: Error): boolean;

/**
 * Add breadcrumb to Sentry
 * @param message - Breadcrumb message
 * @param data - Breadcrumb data
 */
function addSentryBreadcrumb(
  message: string,
  data?: Record<string, unknown>,
): void;
```

## Data Model / Interface Changes

### New Error Context Interface

```typescript
interface ErrorContext {
  timestamp: number;
  fingerprint: string;
  count: number; // How many times this error occurred
  lastOccurred: number;
  message: string;
  stack?: string;
}
```

### Deduplication Map (GlobalErrorHandlers)

```typescript
// Map<errorFingerprint, ErrorContext>
// Stored in memory; cleared on error resolution
// Auto-clear entries older than 30 seconds
```

## Delivery Phases

### Phase 1: Core Error Handling Utilities (1-2 hours)

**Deliverables**:

- `useAsyncHandler` hook with tests
- `useHydrationSafeState` hook with tests
- `error-handler-utils.ts` helper functions with tests
- All utilities properly typed and documented

**Success Criteria**:

- TypeCheck passes
- Lint passes
- Unit tests pass
- Coverage >80% for new code

### Phase 2: Enhanced Global Error Handlers (1 hour)

**Deliverables**:

- Update `GlobalErrorHandlers` with deduplication
- Improve error context tracking
- Add Sentry breadcrumbs

**Success Criteria**:

- No duplicate log entries for same error
- TypeCheck passes
- Lint passes
- Integration tests pass

### Phase 3: Error Boundary Improvements (1 hour)

**Deliverables**:

- Update `error.tsx` with better UX
- Update `global-error.tsx` without hydration issues
- Improve styling and recovery options

**Success Criteria**:

- No hydration mismatch errors
- Good error display
- TypeCheck passes
- Lint passes

### Phase 4: Fix Sentry Example Page (1 hour)

**Deliverables**:

- Fix hydration issues in `sentry-example-page/page.tsx`
- Use `useAsyncHandler` for error throwing
- Use `useHydrationSafeState` for state

**Success Criteria**:

- No hydration mismatch errors
- No unhandled promise rejections
- TypeCheck passes
- Lint passes
- E2E test passes

## Verification Approach

### Testing Strategy

#### Unit Tests

- Test each hook in isolation
- Mock logger and Sentry
- Test error scenarios, success cases, edge cases
- Location: Co-located `.test.ts` files

#### Integration Tests

- Test `GlobalErrorHandlers` with multiple errors
- Test deduplication logic
- Test hook interaction with components
- Location: `src/testing/integration/` (if exists) or co-located

#### E2E Tests

- Verify error boundary catches errors
- Verify sentry example page has no hydration errors
- Verify error recovery works
- Use existing E2E test setup

### Lint & Type Verification

```bash
# Must pass before completing each phase
pnpm typecheck          # TypeScript compiler check
pnpm lint              # ESLint + Prettier
pnpm test              # Run unit/integration tests
pnpm test:e2e          # Run E2E tests (if using)
```

### Manual Verification Checklist

- [ ] No console errors on `/sentry-example-page`
- [ ] Click "Throw Sample Error" button doesn't show unhandled rejection
- [ ] Error properly appears in Sentry dashboard
- [ ] Error boundary UI appears on error
- [ ] Refresh button recovers from error
- [ ] No hydration mismatch warnings
- [ ] Works in dev and production builds

## Performance Considerations

### Memory

- Error deduplication map: ~1KB per tracked error (5-10 typical)
- Auto-clear old entries to prevent unbounded growth
- Refs used instead of state for tracking to minimize re-renders

### Rendering

- `useAsyncHandler` uses refs for loading/error to avoid unnecessary re-renders
- `useHydrationSafeState` updates after hydration without visible flicker
- No new effect dependencies added

### Network

- Deduplication reduces Sentry event quota usage
- Same errors not sent multiple times
- Better error grouping in Sentry

## Security Considerations

### Error Information Disclosure

- Only show error details in development
- Production shows user-friendly messages
- Stack traces never sent to client in production
- Sentry receives full context but with data sanitization enabled

### Sensitive Data

- Don't log sensitive data (passwords, tokens) in error contexts
- Use pino's serializers already configured
- Sentry has sensitive field redaction

## Browser Compatibility

- Chrome/Edge: Full support
- Firefox: Full support
- Safari: Full support
- IE11: Not supported (Next.js 16 is modern-only)

## Documentation

### Developer Documentation

- JSDoc comments on all public functions
- Usage examples in hook comments
- Comments explaining complex logic
- No separate README (documented in JSDoc)

### Example Patterns

Will be demonstrated in:

1. Updated `sentry-example-page/page.tsx`
2. Hook JSDoc examples
3. Test files as usage reference

## Migration Path (for existing code)

Developers can adopt new hooks incrementally:

**Before**:

```typescript
<button onClick={async () => {
  const result = await api.call();
}}>
```

**After**:

```typescript
const { handler } = useAsyncHandler(async () => api.call());
<button onClick={handler}>
```

No breaking changes to existing error handling.

## Risk Mitigation

| Risk                                         | Probability | Impact | Mitigation                                 |
| -------------------------------------------- | ----------- | ------ | ------------------------------------------ |
| Hydration issues in new code                 | Medium      | High   | Comprehensive testing, E2E validation      |
| Error deduplication removes important events | Low         | Medium | Config timeout, monitor Sentry dashboard   |
| Performance degradation                      | Low         | Medium | Ref-based state tracking, memory limits    |
| Regression in existing error handling        | Low         | High   | Full test coverage, backward compatibility |

## Success Metrics

1. **Unhandled Errors**: 0 unhandled promise rejections in production
2. **Hydration**: 0 hydration mismatch errors
3. **Coverage**: >80% code coverage for new code
4. **Quality**: All tests pass, lint/typecheck pass
5. **User Experience**: Error recovery works, helpful messages shown
6. **Observability**: All errors properly logged to Sentry

## Timeline

- **Phase 1**: 1-2 hours
- **Phase 2**: 1 hour
- **Phase 3**: 1 hour
- **Phase 4**: 1 hour
- **Total**: 4-5 hours

## References

- [Next.js Error Handling](https://nextjs.org/docs/app/building-your-application/routing/error-handling)
- [React Error Boundaries](https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary)
- [Sentry Error Tracking](https://docs.sentry.io/platforms/javascript/guides/nextjs/)
- [MDN: unhandledrejection Event](https://developer.mozilla.org/en-US/docs/Web/API/Window/unhandledrejection_event)
- [React Hydration Best Practices](https://react.dev/link/hydration-mismatch)
