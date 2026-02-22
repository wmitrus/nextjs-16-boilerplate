# Full SDD workflow

## Workflow Steps

### [x] Step: Requirements

Create a Product Requirements Document (PRD) based on the feature description.

1. ✅ Review existing codebase to understand current architecture and patterns
2. ✅ Analyze the feature definition and identify unclear aspects
3. ✅ Made reasonable decisions for error handling patterns based on context
4. ✅ Identified root causes of unhandled promises, hydration mismatches, and router errors

**PRD Created**: `/home/ozi/projects/nextjs-16-boilerplate/.zencoder/chats/e5043766-b2d3-48dd-bd8c-b799ef9f157b/requirements.md`

**Key Findings**:

- Unhandled promise rejections occur in async click handlers without try-catch
- Hydration mismatches caused by `typeof window !== 'undefined'` in render logic
- Router errors cascade from hydration mismatches
- GlobalErrorHandlers exists but doesn't prevent errors in event handlers
- Sentry integration is properly configured; problem is at component level

### [x] Step: Technical Specification

Create a technical specification based on the PRD in `/home/ozi/projects/nextjs-16-boilerplate/.zencoder/chats/e5043766-b2d3-48dd-bd8c-b799ef9f157b/requirements.md`.

1. ✅ Reviewed existing codebase architecture and identified reusable components
2. ✅ Defined implementation approach with detailed API specs

**Spec Created**: `/home/ozi/projects/nextjs-16-boilerplate/.zencoder/chats/e5043766-b2d3-48dd-bd8c-b799ef9f157b/spec.md`

**Architecture Overview**:

- Hook-based utilities (`useAsyncHandler`, `useHydrationSafeState`)
- Enhanced `GlobalErrorHandlers` with deduplication
- Error boundary improvements
- Integrated with existing Sentry + pino infrastructure

**Delivery Phases Defined**:

1. Core error utilities (1-2 hours)
2. Enhanced global handlers (1 hour)
3. Error boundary improvements (1 hour)
4. Sentry example page fix (1 hour)

### [x] Step: Planning

Create a detailed implementation plan based on `/home/ozi/projects/nextjs-16-boilerplate/.zencoder/chats/e5043766-b2d3-48dd-bd8c-b799ef9f157b/spec.md`.

**Planning Complete**: Detailed implementation tasks defined below.

---

## Implementation Tasks

### Phase 1: Core Error Handling Utilities

#### [ ] Task 1.1: Create `useAsyncHandler` Hook

**File**: `src/shared/hooks/useAsyncHandler.ts`
**Description**: Implement safe async event handler wrapper hook
**Details**:

- Wraps async functions to catch rejections
- Logs errors to pino logger and Sentry
- Returns { handler, isLoading, error } object
- Prevents overlapping calls when preventDuplicates=true
- Comprehensive JSDoc with examples
  **Verification**: `pnpm typecheck && pnpm lint`

#### [ ] Task 1.2: Create `useAsyncHandler` Tests

**File**: `src/shared/hooks/useAsyncHandler.test.ts`
**Description**: Unit tests for useAsyncHandler hook
**Details**:

- Test successful async operation
- Test error handling and logging
- Test loading state transitions
- Test preventDuplicates behavior
- Test onSuccess and onError callbacks
- Mock logger and Sentry
  **Verification**: Tests pass, coverage >80%

#### [ ] Task 1.3: Create `useHydrationSafeState` Hook

**File**: `src/shared/hooks/useHydrationSafeState.ts`
**Description**: Implement hydration-safe state hook
**Details**:

- Returns initialValue during SSR
- Detects first client render with ref
- Optionally calls asyncInit for client value
- Prevents hydration mismatches
- Comprehensive JSDoc with examples
  **Verification**: `pnpm typecheck && pnpm lint`

#### [ ] Task 1.4: Create `useHydrationSafeState` Tests

**File**: `src/shared/hooks/useHydrationSafeState.test.ts`
**Description**: Unit tests for useHydrationSafeState hook
**Details**:

- Test SSR value returned immediately
- Test asyncInit called on client mount
- Test setState functionality
- Test with different value types
- Test hydration matching
  **Verification**: Tests pass, coverage >80%

#### [ ] Task 1.5: Create Error Handler Utilities

**File**: `src/shared/components/error/error-handler-utils.ts`
**Description**: Helper functions for error handling
**Details**:

- getErrorFingerprint(error): string
- formatErrorContext(error, context): object
- shouldReportToSentry(error): boolean
- addSentryBreadcrumb(message, data): void
- Comprehensive JSDoc
  **Verification**: `pnpm typecheck && pnpm lint`

#### [ ] Task 1.6: Create Error Handler Utils Tests

**File**: `src/shared/components/error/error-handler-utils.test.ts`
**Description**: Unit tests for error utility functions
**Details**:

- Test fingerprint generation
- Test context formatting
- Test Sentry filtering logic
- Test breadcrumb creation
  **Verification**: Tests pass, coverage >80%

---

### Phase 2: Enhanced Global Error Handlers

#### [ ] Task 2.1: Update GlobalErrorHandlers with Deduplication

**File**: `src/shared/components/error/global-error-handlers.tsx`
**Description**: Enhance existing handler with error deduplication
**Details**:

- Add error deduplication Map
- Track error frequency
- Auto-clear old entries (30 second timeout)
- Better error context attachment
- Add Sentry breadcrumbs
- Improve handleError and handleRejection logic
  **Verification**: `pnpm typecheck && pnpm lint`

#### [ ] Task 2.2: Integration Tests for GlobalErrorHandlers

**File**: Create test for global-error-handlers
**Description**: Test enhanced error handler functionality
**Details**:

- Test error deduplication
- Test multiple errors are tracked
- Test error frequency tracking
- Test Sentry integration
- Test logger integration
  **Verification**: Tests pass

---

### Phase 3: Error Boundary Improvements

#### [ ] Task 3.1: Improve Route Error Boundary

**File**: `src/app/error.tsx`
**Description**: Update route-level error boundary UX
**Details**:

- Keep existing error handling
- Improve layout and styling
- Show error digest for debugging
- Better recovery messaging
- Use ErrorAlert component if appropriate
  **Verification**: `pnpm typecheck && pnpm lint`

#### [ ] Task 3.2: Fix Global Error Boundary

**File**: `src/app/global-error.tsx`
**Description**: Update critical error boundary without hydration issues
**Details**:

- Remove any hydration-causing logic
- Use static values and text
- Proper error logging
- Clear user-friendly messaging
- Add Sentry integration
  **Verification**: `pnpm typecheck && pnpm lint`

---

### Phase 4: Fix Sentry Example Page

#### [ ] Task 4.1: Fix Sentry Example Page Hydration Issues

**File**: `src/app/sentry-example-page/page.tsx`
**Description**: Fix hydration mismatches and use new error handling patterns
**Details**:

- Replace `typeof window !== 'undefined'` checks with useHydrationSafeState
- Use useAsyncHandler for throw button
- Fix isDev state initialization
- Fix isConnected state initialization
- Proper async connectivity check
- Remove/fix inline styles that change based on state
  **Verification**: `pnpm typecheck && pnpm lint`

#### [ ] Task 4.2: Verify No Errors on Sentry Example Page

**File**: Test in browser
**Description**: Manual testing of sentry example page
**Details**:

- Run `pnpm dev`
- Navigate to `/sentry-example-page`
- Verify no hydration mismatch errors
- Click throw error button
- Verify no unhandled rejection in console
- Verify error appears in Sentry
- Verify error logging works
  **Verification**: No console errors, error properly tracked

---

## Verification & Quality Gates

### After Each Task

- `pnpm typecheck` passes
- `pnpm lint` passes
- Relevant tests pass

### After Each Phase

- All phase tasks completed
- All tests passing
- No type errors
- No lint errors

### Final Verification

- `pnpm typecheck` passes
- `pnpm lint` passes
- `pnpm test` passes (all tests)
- Manual verification on `/sentry-example-page`
- No unhandled promise rejections
- No hydration mismatch warnings
- Errors properly appear in Sentry
