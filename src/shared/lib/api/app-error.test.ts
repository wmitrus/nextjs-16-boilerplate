import { describe, expect, it, vi } from 'vitest';

import { AppError } from './app-error';

describe('AppError', () => {
  it('creates error with defaults and preserves prototype', () => {
    const error = new AppError('Oops');

    expect(error).toBeInstanceOf(AppError);
    expect(error.statusCode).toBe(400);
    expect(error.code).toBeUndefined();
    expect(error.errors).toBeUndefined();
  });

  it('does not throw when captureStackTrace is unavailable', () => {
    const original = Error.captureStackTrace;
    // @ts-expect-error - simulate missing captureStackTrace
    Error.captureStackTrace = undefined;

    expect(() => new AppError('No stack')).not.toThrow();

    Error.captureStackTrace = original;
  });

  it('captures stack trace when available', () => {
    const spy = vi.spyOn(Error, 'captureStackTrace');

    const error = new AppError('With stack');

    expect(spy).toHaveBeenCalledWith(error, AppError);

    spy.mockRestore();
  });
});
