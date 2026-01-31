'use client';

import { useEffect } from 'react';

import { logger } from '@/core/logger/client';

export default function UsersErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error(error, 'Users route error boundary caught an error');
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <div className="mb-4 rounded-full bg-amber-100 p-3">
        <svg
          className="h-8 w-8 text-amber-700"
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
      <h2 className="text-2xl font-bold text-gray-900">Users page crashed</h2>
      <p className="mt-2 max-w-md text-gray-600">
        We couldn’t load this section. Please try again.
      </p>
      {process.env.NODE_ENV !== 'production' && (
        <pre className="mt-4 max-w-full overflow-auto rounded bg-gray-100 p-4 text-left text-xs">
          {error.message}
          {error.stack}
        </pre>
      )}
      <div className="mt-6 flex gap-3">
        <button
          onClick={() => reset()}
          className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 focus:outline-none"
        >
          Retry users page
        </button>
        <button
          onClick={() => (window.location.href = '/')}
          className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 focus:outline-none"
        >
          Go home
        </button>
      </div>
    </div>
  );
}
