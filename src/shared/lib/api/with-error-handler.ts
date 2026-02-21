import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { ZodError } from 'zod';

import { logger as baseLogger } from '@/core/logger/server';

import { AppError } from './app-error';
import {
  createServerErrorResponse,
  createValidationErrorResponse,
} from './response-service';

const logger = baseLogger.child({
  type: 'API',
  category: 'error-handling',
  module: 'with-error-handler',
});

type RouteHandler = (
  request: NextRequest,
  context: { params: Promise<Record<string, string | string[]>> },
) => Promise<NextResponse> | NextResponse;

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

  // Example: Prisma Unique Constraint
  // if (error instanceof Prisma.PrismaClientKnownRequestError) {
  //   if (error.code === 'P2002') {
  //     return new AppError('Resource already exists', 409, 'ALREADY_EXISTS');
  //   }
  // }

  return error;
}

/**
 * Higher-order function to wrap API route handlers with error handling
 */
export function withErrorHandler(handler: RouteHandler): RouteHandler {
  return async (request, context) => {
    const correlationId = request.headers.get('x-correlation-id') || 'unknown';

    try {
      return await handler(request, context);
    } catch (rawError) {
      const error = mapToAppError(rawError);

      if (error instanceof AppError) {
        if (error.statusCode >= 500) {
          logger.error(
            {
              path: request.nextUrl.pathname,
              correlationId,
              err: error,
              code: error.code,
            },
            'AppError (500+)',
          );
        } else {
          logger.warn(
            {
              path: request.nextUrl.pathname,
              correlationId,
              err: error,
              code: error.code,
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

      const errorMessage =
        error instanceof Error ? error.message : 'Internal Server Error';

      logger.error(
        {
          path: request.nextUrl.pathname,
          correlationId,
          err: error,
        },
        'Unhandled API Error',
      );

      const publicMessage =
        process.env.NODE_ENV === 'production'
          ? 'Internal Server Error'
          : errorMessage;

      return createServerErrorResponse(publicMessage, 500);
    }
  };
}
