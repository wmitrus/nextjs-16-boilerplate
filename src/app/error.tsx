'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

import { logger as baseLogger } from '@/core/logger/client';

const logger = baseLogger.child({
  type: 'UI',
  category: 'error-boundary',
  module: 'root-error',
});

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error(
      {
        err: error,
        digest: error.digest,
      },
      'Root Error Boundary caught an error',
    );

    if (error instanceof Error) {
      Sentry.captureException(error, {
        contexts: {
          error_boundary: {
            level: 'route',
            digest: error.digest,
          },
        },
      });
    }
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-8 text-center">
      <div className="mb-6 rounded-full bg-red-100 p-4">
        <svg
          className="h-10 w-10 text-red-600"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
      </div>

      <div className="max-w-md">
        <h1 className="text-3xl font-bold text-gray-900">
          Something went wrong!
        </h1>
        <p className="mt-3 text-gray-600">
          An unexpected error occurred. We have been notified and are working to
          fix it.
        </p>

        {error.digest && (
          <div className="mt-4 rounded-md bg-gray-50 p-4 text-left">
            <p className="text-xs font-semibold text-gray-700">
              Error Reference ID
            </p>
            <p className="mt-1 font-mono text-xs break-all text-gray-600">
              {error.digest}
            </p>
          </div>
        )}

        {process.env.NODE_ENV !== 'production' && (
          <div className="mt-4 rounded-md bg-red-50 p-4 text-left">
            <p className="text-xs font-semibold text-red-700">
              Debug Information
            </p>
            <pre className="mt-2 overflow-auto text-xs text-red-600">
              {error.message}
              {'\n\n'}
              {error.stack}
            </pre>
          </div>
        )}
      </div>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <button
          onClick={() => reset()}
          className="rounded-md bg-blue-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none"
        >
          Try again
        </button>
        <button
          onClick={() => (window.location.href = '/')}
          className="rounded-md border border-gray-300 bg-white px-6 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none"
        >
          Go home
        </button>
      </div>
    </div>
  );
}
