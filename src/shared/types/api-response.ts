export type ApiStatus = 'ok' | 'form_errors' | 'server_error' | 'redirect';

export interface BaseApiResponse {
  status: ApiStatus;
}

export interface SuccessResponse<T> extends BaseApiResponse {
  status: 'ok';
  data: T;
  meta?: Record<string, unknown>;
}

export interface FormErrorsResponse extends BaseApiResponse {
  status: 'form_errors';
  errors: Record<string, string[]>;
}

export interface ServerErrorResponse extends BaseApiResponse {
  status: 'server_error';
  error: string;
  code?: string;
}

export interface RedirectResponse extends BaseApiResponse {
  status: 'redirect';
  url: string;
}

export type ApiResponse<T> =
  | SuccessResponse<T>
  | FormErrorsResponse
  | ServerErrorResponse
  | RedirectResponse;

/**
 * Custom Error class for expected API errors
 */
export class AppError extends Error {
  public statusCode: number;
  public code?: string;
  public errors?: Record<string, string[]>;

  constructor(
    message: string,
    statusCode: number = 400,
    code?: string,
    errors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.errors = errors;

    // Ensure proper prototype chain for inheritance
    Object.setPrototypeOf(this, AppError.prototype);

    // Capture stack trace if available
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError);
    }
  }
}
