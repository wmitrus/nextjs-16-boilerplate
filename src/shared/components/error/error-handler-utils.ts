import * as Sentry from '@sentry/nextjs';

/**
 * Create a fingerprint for error deduplication.
 * Generates a unique identifier based on error message and stack trace.
 *
 * @param error - The error object to fingerprint
 * @returns Unique identifier string for this error type
 *
 * @example
 * ```typescript
 * const fingerprint = getErrorFingerprint(new Error('Network error'));
 * // Returns: 'Network error|/path/to/file.ts:10:5'
 * ```
 */
export function getErrorFingerprint(error: Error): string {
  const message = error.message || 'Unknown error';
  const stack = error.stack || '';

  const firstStackLine = stack.split('\n').find((line) => line.includes('at '));

  return `${message}|${firstStackLine || 'no-stack'}`;
}

/**
 * Format error context for logging.
 * Extracts relevant error information and combines with additional context.
 *
 * @param error - The error object
 * @param context - Additional context data
 * @returns Formatted error context object suitable for logging
 *
 * @example
 * ```typescript
 * const context = formatErrorContext(error, { userId: '123', action: 'submit' });
 * // Returns: { err: error, userId: '123', action: 'submit', filename: '...', ... }
 * ```
 */
export function formatErrorContext(
  error: Error,
  context?: Record<string, unknown>,
): Record<string, unknown> {
  return {
    err: error,
    message: error.message,
    stack: error.stack?.split('\n').slice(0, 5),
    ...context,
  };
}

/**
 * Check if an error should be reported to Sentry.
 * Filters out common non-critical errors that would clutter Sentry.
 *
 * @param error - The error to check
 * @returns true if error should be reported to Sentry, false otherwise
 *
 * @example
 * ```typescript
 * if (shouldReportToSentry(error)) {
 *   Sentry.captureException(error);
 * }
 * ```
 */
export function shouldReportToSentry(error: Error): boolean {
  const message = error.message || '';
  const stack = error.stack || '';

  const ignoredPatterns = [
    'ResizeObserver loop limit exceeded',
    'Non-Error promise rejection captured',
    'Network request failed',
    'cannot_render_single_session_enabled',
  ];

  const isIgnored = ignoredPatterns.some(
    (pattern) => message.includes(pattern) || stack.includes(pattern),
  );

  return !isIgnored;
}

/**
 * Add a breadcrumb to Sentry for debugging.
 * Breadcrumbs help trace the sequence of events leading to an error.
 *
 * @param message - Breadcrumb message
 * @param data - Optional breadcrumb data
 *
 * @example
 * ```typescript
 * addSentryBreadcrumb('User submitted form', { formId: 'contact-form' });
 * ```
 */
export function addSentryBreadcrumb(
  message: string,
  data?: Record<string, unknown>,
): void {
  Sentry.captureMessage(message, 'debug');

  if (data) {
    Sentry.captureMessage(`${message}: ${JSON.stringify(data)}`, 'debug');
  }
}

/**
 * Create error context with timestamp and metadata.
 * Useful for tracking error frequency and timing.
 *
 * @param error - The error object
 * @param count - How many times this error has occurred
 * @returns Error context with timing and count information
 *
 * @internal
 */
export interface ErrorContext {
  timestamp: number;
  fingerprint: string;
  count: number;
  lastOccurred: number;
  message: string;
  stack?: string;
}

/**
 * Create an error context object.
 *
 * @param error - The error object
 * @param count - Number of occurrences
 * @returns Error context object
 *
 * @internal
 */
export function createErrorContext(
  error: Error,
  count: number = 1,
): ErrorContext {
  const timestamp = Date.now();

  return {
    timestamp,
    fingerprint: getErrorFingerprint(error),
    count,
    lastOccurred: timestamp,
    message: error.message,
    stack: error.stack,
  };
}
