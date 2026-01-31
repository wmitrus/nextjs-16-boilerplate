import { headers } from 'next/headers';

import { logger } from '@/core/logger/server';

import { AppError } from '@/shared/lib/api/app-error';
import type { ApiResponse } from '@/shared/types/api-response';

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
      if (rawError instanceof AppError) {
        if (rawError.statusCode >= 500) {
          logger.error(
            {
              correlationId,
              err: rawError,
              code: rawError.code,
            },
            'AppError in Server Action (500+)',
          );
        } else {
          logger.warn(
            {
              correlationId,
              err: rawError,
              code: rawError.code,
            },
            'AppError in Server Action',
          );
        }

        if (rawError.errors) {
          return {
            status: 'form_errors',
            errors: rawError.errors,
          };
        }

        return {
          status: 'server_error',
          error: rawError.message,
          code: rawError.code,
        };
      }

      const errorMessage =
        rawError instanceof Error ? rawError.message : 'Internal Server Error';

      logger.error(
        {
          correlationId,
          err: rawError,
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
