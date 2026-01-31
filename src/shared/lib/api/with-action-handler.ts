import { isRedirectError } from 'next/dist/client/components/redirect-error';
import { headers } from 'next/headers';
import { ZodError } from 'zod';

import { logger } from '@/core/logger/server';

import { AppError } from '@/shared/lib/api/app-error';
import type { ApiResponse } from '@/shared/types/api-response';

/**
 * Maps external errors (like Zod or DB errors) to AppError
 */
function mapToAppError(error: unknown): unknown {
  if (error instanceof ZodError) {
    const errors: Record<string, string[]> = {};
    error.issues.forEach((err) => {
      const path = err.path.join('.');
      if (!errors[path]) {
        errors[path] = [];
      }
      errors[path].push(err.message);
    });
    return new AppError('Validation failed', 400, 'VALIDATION_ERROR', errors);
  }

  return error;
}

/**
 * Higher-order function to wrap Server Actions with error handling.
 * Returns a standardized ApiResponse object.
 */
export function withActionHandler<T, Args extends unknown[]>(
  action: (...args: Args) => Promise<T>,
): (...args: Args) => Promise<ApiResponse<T>> {
  return async (...args: Args): Promise<ApiResponse<T>> => {
    const headerList = await headers();
    const correlationId = headerList.get('x-correlation-id') || 'unknown';

    try {
      const data = await action(...args);
      return {
        status: 'ok',
        data,
      };
    } catch (rawError) {
      if (isRedirectError(rawError)) {
        throw rawError;
      }

      const error = mapToAppError(rawError);

      if (error instanceof AppError) {
        if (error.statusCode >= 500) {
          logger.error(
            {
              correlationId,
              err: error,
              code: error.code,
            },
            'AppError in Server Action (500+)',
          );
        } else {
          logger.warn(
            {
              correlationId,
              err: error,
              code: error.code,
            },
            'AppError in Server Action',
          );
        }

        if (error.errors) {
          return {
            status: 'form_errors',
            errors: error.errors,
          };
        }

        return {
          status: 'server_error',
          error: error.message,
          code: error.code,
        };
      }

      const errorMessage =
        error instanceof Error ? error.message : 'Internal Server Error';

      logger.error(
        {
          correlationId,
          err: error,
        },
        'Unhandled Error in Server Action',
      );

      return {
        status: 'server_error',
        error:
          process.env.NODE_ENV === 'production'
            ? 'Internal Server Error'
            : errorMessage,
      };
    }
  };
}
