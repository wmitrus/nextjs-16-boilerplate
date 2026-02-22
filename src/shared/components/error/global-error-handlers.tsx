'use client';

import { useEffect } from 'react';

import { getBrowserLogger } from '@/core/logger/browser';

/**
 * Component that initializes global client-side error listeners.
 * Should be rendered once at the root of the application.
 */
export function GlobalErrorHandlers() {
  useEffect(() => {
    const logger = getBrowserLogger();

    const handleError = (event: ErrorEvent) => {
      const message = event.message || '';

      // Ignore non-critical errors that would create log loops
      const ignoredPatterns = [
        'Connection closed', // Logflare connection error
        'Network error', // Generic network errors
        'Failed to fetch', // Fetch failures
      ];

      if (ignoredPatterns.some((pattern) => message.includes(pattern))) {
        console.debug('Ignored unhandled error:', message);
        return;
      }

      try {
        logger.error(
          {
            err: event.error || new Error(event.message),
            filename: event.filename,
            lineno: event.lineno,
            colno: event.colno,
          },
          'Unhandled Client Error',
        );
      } catch (err) {
        console.error('Failed to log unhandled error:', err);
      }
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const message = reason instanceof Error ? reason.message : String(reason);

      // Ignore non-critical errors that would create log loops
      const ignoredPatterns = [
        'cannot_render_single_session_enabled', // Clerk no-op
        'Connection closed', // Logflare connection error
        'Network error', // Generic network errors
        'Failed to fetch', // Fetch failures
      ];

      if (ignoredPatterns.some((pattern) => message.includes(pattern))) {
        console.debug('Ignored unhandled rejection:', message);
        return;
      }

      try {
        logger.error(
          {
            err: reason instanceof Error ? reason : new Error(String(reason)),
          },
          'Unhandled Promise Rejection',
        );
      } catch (err) {
        console.error('Failed to log unhandled rejection:', err);
      }
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, []);

  return null;
}
