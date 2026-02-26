'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

import { IGNORED_REJECTION_PATTERNS } from '@/core/error/ignored-rejection-patterns';
import { getBrowserLogger } from '@/core/logger/browser';

import {
  getErrorFingerprint,
  shouldReportToSentry,
  addSentryBreadcrumb,
  type ErrorContext,
  createErrorContext,
} from './error-handler-utils';

/**
 * Component that initializes global client-side error listeners.
 * Captures errors to both local logging and Sentry with deduplication.
 * Should be rendered once at the root of the application.
 *
 * Features:
 * - Deduplicates identical errors within a 30-second window
 * - Tracks error frequency and last occurrence
 * - Ignores non-critical patterns to prevent log spam
 * - Integrates with Sentry for error tracking
 * - Adds breadcrumbs for debugging context
 */
export function GlobalErrorHandlers() {
  useEffect(() => {
    const logger = getBrowserLogger();

    // Map to track errors and deduplicate them
    // Key: error fingerprint, Value: error context with timing info
    const errorMap = new Map<string, ErrorContext>();

    // Cleanup old error entries every 30 seconds
    const cleanupInterval = setInterval(() => {
      const now = Date.now();
      const thirtySecAgo = now - 30000;

      for (const [fingerprint, context] of errorMap.entries()) {
        if (context.lastOccurred < thirtySecAgo) {
          errorMap.delete(fingerprint);
        }
      }
    }, 30000);

    const handleError = (event: ErrorEvent) => {
      const message = event.message || '';

      // Ignore non-critical errors that would create log loops
      const ignoredPatterns = [
        'Network error', // Generic network errors
        'Failed to fetch', // Fetch failures
        'ResizeObserver loop limit exceeded',
      ];

      if (ignoredPatterns.some((pattern) => message.includes(pattern))) {
        console.debug('Ignored unhandled error:', message);
        return;
      }

      const error = event.error || new Error(event.message);
      const fingerprint = getErrorFingerprint(error);

      // Check if we've already logged this error recently
      const existingContext = errorMap.get(fingerprint);
      if (existingContext) {
        existingContext.count += 1;
        existingContext.lastOccurred = Date.now();
        console.debug(
          `Deduplicated error (occurrence #${existingContext.count}):`,
          message,
        );
        return;
      }

      // New error, log it
      const errorContext = createErrorContext(error);
      errorMap.set(fingerprint, errorContext);

      try {
        logger.error(
          {
            err: error,
            filename: event.filename,
            lineno: event.lineno,
            colno: event.colno,
          },
          'Unhandled Client Error',
        );

        if (shouldReportToSentry(error)) {
          Sentry.captureException(error, {
            contexts: {
              error: {
                type: 'unhandled-error',
                filename: event.filename,
                lineno: event.lineno,
                colno: event.colno,
              },
            },
          });
          addSentryBreadcrumb('Unhandled client error', {
            message,
            filename: event.filename,
          });
        }
      } catch (err) {
        console.error('Failed to log unhandled error:', err);
      }
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const message = reason instanceof Error ? reason.message : String(reason);

      if (
        IGNORED_REJECTION_PATTERNS.some((pattern) => message.includes(pattern))
      ) {
        console.debug('Ignored unhandled rejection:', message);
        return;
      }

      const error =
        reason instanceof Error ? reason : new Error(String(reason));
      const fingerprint = getErrorFingerprint(error);

      // Check if we've already logged this error recently
      const existingContext = errorMap.get(fingerprint);
      if (existingContext) {
        existingContext.count += 1;
        existingContext.lastOccurred = Date.now();
        console.debug(
          `Deduplicated rejection (occurrence #${existingContext.count}):`,
          message,
        );
        return;
      }

      // New error, log it
      const errorContext = createErrorContext(error);
      errorMap.set(fingerprint, errorContext);

      try {
        logger.error(
          {
            err: error,
          },
          'Unhandled Promise Rejection',
        );

        if (shouldReportToSentry(error)) {
          Sentry.captureException(error, {
            contexts: {
              error: {
                type: 'unhandled-rejection',
              },
            },
          });
          addSentryBreadcrumb('Unhandled promise rejection', { message });
        }
      } catch (err) {
        console.error('Failed to log unhandled rejection:', err);
      }
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
      clearInterval(cleanupInterval);
    };
  }, []);

  return null;
}
