'use client';

import { useEffect } from 'react';

import { logger as baseLogger } from '@/core/logger/client';

const logger = baseLogger.child({
  type: 'UI',
  category: 'error-boundary',
  module: 'e2e-error',
});

export default function E2eErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error(error, 'E2E error boundary caught an error');
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <h2 className="text-2xl font-bold text-gray-900">E2E Error Boundary</h2>
      <p className="text-gray-600">The page crashed as expected for tests.</p>
      <button
        onClick={() => reset()}
        className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:outline-none"
      >
        Retry
      </button>
    </div>
  );
}
