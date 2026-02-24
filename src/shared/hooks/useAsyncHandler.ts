import * as Sentry from '@sentry/nextjs';
import { useRef, useState } from 'react';

import { getBrowserLogger } from '@/core/logger/browser';

/**
 * Custom hook for safely handling async operations in event handlers.
 * Automatically catches rejections, logs errors, and sends to Sentry.
 *
 * This hook prevents unhandled promise rejections by wrapping async callbacks
 * in try-catch blocks and providing automatic error logging and reporting.
 *
 * @template T - The async function's return type
 *
 * @param callback - Async function to execute
 * @param options - Configuration options
 * @param options.onError - Callback invoked on error with the caught error
 * @param options.onSuccess - Callback invoked on success with the result
 * @param options.preventDuplicates - Prevent overlapping/concurrent calls (default: true)
 *
 * @returns Object with handler function, loading state, and error state
 * @returns handler - Function to call in event handlers (e.g., onClick)
 * @returns isLoading - Boolean indicating if async operation is in progress
 * @returns error - Current error or null if no error
 *
 * @example
 * ```typescript
 * const { handler, isLoading, error } = useAsyncHandler(
 *   async () => await api.submitForm(data),
 *   {
 *     onSuccess: () => setShowMessage(true),
 *     onError: (err) => setErrorMsg(err.message)
 *   }
 * );
 *
 * return (
 *   <>
 *     <button onClick={handler} disabled={isLoading}>
 *       {isLoading ? 'Submitting...' : 'Submit'}
 *     </button>
 *     {error && <ErrorAlert error={error} />}
 *   </>
 * );
 * ```
 */
export function useAsyncHandler<T>(
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
} {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const isExecutingRef = useRef(false);
  const errorTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const loggerRef = useRef(getBrowserLogger());

  const preventDuplicates = options?.preventDuplicates ?? true;

  const handler = async () => {
    if (preventDuplicates && isExecutingRef.current) {
      return;
    }

    isExecutingRef.current = true;
    setIsLoading(true);
    setError(null);

    if (errorTimeoutRef.current) {
      clearTimeout(errorTimeoutRef.current);
      errorTimeoutRef.current = null;
    }

    try {
      const result = await callback();
      options?.onSuccess?.(result);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));

      loggerRef.current.error(
        {
          err: error,
          context: 'useAsyncHandler',
        },
        'Async handler error',
      );

      Sentry.captureException(error);

      setError(error);
      options?.onError?.(error);

      errorTimeoutRef.current = setTimeout(() => {
        setError(null);
        errorTimeoutRef.current = null;
      }, 5000);
    } finally {
      setIsLoading(false);
      isExecutingRef.current = false;
    }
  };

  return {
    handler,
    isLoading,
    error,
  };
}
