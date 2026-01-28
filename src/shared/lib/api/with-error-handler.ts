import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';

import { logger } from '@/core/logger/server';

import { AppError } from '@/shared/types/api-response';

import {
  createServerErrorResponse,
  createValidationErrorResponse,
} from './response-service';

type RouteHandler = (
  request: NextRequest,
  context: { params: Promise<Record<string, string | string[]>> },
) => Promise<NextResponse> | NextResponse;

/**
 * Higher-order function to wrap API route handlers with error handling
 */
export function withErrorHandler(handler: RouteHandler): RouteHandler {
  return async (request, context) => {
    try {
      return await handler(request, context);
    } catch (error) {
      if (error instanceof AppError) {
        // Log expected errors as info or warn
        if (error.statusCode >= 500) {
          logger.error(
            {
              path: request.nextUrl.pathname,
              code: error.code,
              message: error.message,
            },
            'AppError (500+)',
          );
        } else {
          logger.warn(
            {
              path: request.nextUrl.pathname,
              code: error.code,
              message: error.message,
            },
            'AppError',
          );
        }

        if (error.errors) {
          return createValidationErrorResponse(error.errors, error.statusCode);
        }

        return createServerErrorResponse(
          error.message,
          error.statusCode,
          error.code,
        );
      }

      // Handle Database errors or other external errors
      // Example: Prisma, Mongo, etc.
      // We can add specific checks here if we know the libraries used.
      // For now, we handle them as generic server errors.

      const errorMessage =
        error instanceof Error ? error.message : 'Internal Server Error';

      logger.error(
        {
          path: request.nextUrl.pathname,
          error: error instanceof Error ? error.stack : error,
        },
        'Unhandled API Error',
      );

      // In production, we don't leak the exact error message unless it's an AppError
      const publicMessage =
        process.env.NODE_ENV === 'production'
          ? 'Internal Server Error'
          : errorMessage;

      return createServerErrorResponse(publicMessage, 500);
    }
  };
}
