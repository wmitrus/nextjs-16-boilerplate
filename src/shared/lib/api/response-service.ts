import { NextResponse } from 'next/server';

import type {
  FormErrorsResponse,
  RedirectResponse,
  ServerErrorResponse,
  SuccessResponse,
} from '@/shared/types/api-response';

/**
 * Creates a success response with status 'ok'
 */
export function createSuccessResponse<T>(
  data: T,
  status: number = 200,
  meta?: Record<string, unknown>,
): NextResponse<SuccessResponse<T>> {
  const body: SuccessResponse<T> = {
    status: 'ok',
    data,
    ...(meta ? { meta } : {}),
  };

  return NextResponse.json(body, { status });
}

/**
 * Creates a validation error response with status 'form_errors'
 */
export function createValidationErrorResponse(
  errors: Record<string, string[]>,
  status: number = 400,
): NextResponse<FormErrorsResponse> {
  const body: FormErrorsResponse = {
    status: 'form_errors',
    errors,
  };

  return NextResponse.json(body, { status });
}

/**
 * Creates a server error response with status 'server_error'
 */
export function createServerErrorResponse(
  message: string,
  status: number = 500,
  code?: string,
): NextResponse<ServerErrorResponse> {
  const body: ServerErrorResponse = {
    status: 'server_error',
    error: message,
    ...(code ? { code } : {}),
  };

  return NextResponse.json(body, { status });
}

/**
 * Creates a redirect response with status 'redirect'
 */
export function createRedirectResponse(
  url: string,
  status: number = 302,
): NextResponse<RedirectResponse> {
  const body: RedirectResponse = {
    status: 'redirect',
    url,
  };

  return NextResponse.json(body, { status });
}
