/**
 * Custom Error class for expected application errors
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
