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
      logger.error(
        {
          err: event.error || new Error(event.message),
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
        },
        'Unhandled Client Error',
      );
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
      logger.error(
        {
          err:
            event.reason instanceof Error
              ? event.reason
              : new Error(String(event.reason)),
        },
        'Unhandled Promise Rejection',
      );
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
