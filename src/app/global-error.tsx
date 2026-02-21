'use client';

import { useEffect } from 'react';

import { logger as baseLogger } from '@/core/logger/client';

const logger = baseLogger.child({
  type: 'UI',
  category: 'error-boundary',
  module: 'global-error',
});

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error(error, 'Global Error caught');
  }, [error]);

  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col items-center justify-center px-4 text-center font-sans">
        <div className="mb-4 rounded-full bg-red-100 p-3">
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
        <h1 className="text-3xl font-bold text-gray-900">Critical Error</h1>
        <p className="mt-2 max-w-md text-gray-600">
          A critical system error has occurred. Please try refreshing the page.
        </p>
        <button
          onClick={() => reset()}
          className="mt-6 rounded-md bg-red-600 px-6 py-3 text-base font-medium text-white hover:bg-red-700 focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:outline-none"
        >
          Refresh Application
        </button>
      </body>
    </html>
  );
}
