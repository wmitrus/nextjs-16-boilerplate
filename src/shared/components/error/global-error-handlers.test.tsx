import { render } from '@testing-library/react';
import type { Logger } from 'pino';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { getBrowserLogger } from '@/core/logger/browser';

import { GlobalErrorHandlers } from './global-error-handlers';

vi.mock('@/core/logger/browser', () => ({
  getBrowserLogger: vi.fn(),
}));

describe('GlobalErrorHandlers', () => {
  const mockLogger: { error: ReturnType<typeof vi.fn> } = {
    error: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getBrowserLogger).mockReturnValue(
      mockLogger as unknown as Logger,
    );
  });

  it('registers and unregisters event listeners', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');

    const { unmount } = render(<GlobalErrorHandlers />);

    expect(addSpy).toHaveBeenCalledWith('error', expect.any(Function));
    expect(addSpy).toHaveBeenCalledWith(
      'unhandledrejection',
      expect.any(Function),
    );

    unmount();

    expect(removeSpy).toHaveBeenCalledWith('error', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith(
      'unhandledrejection',
      expect.any(Function),
    );
  });

  it('logs unhandled error events', () => {
    render(<GlobalErrorHandlers />);

    const error = new Error('Global crash');
    const event = new ErrorEvent('error', {
      error,
      message: 'Global crash',
      filename: 'test.js',
      lineno: 10,
      colno: 5,
    });

    window.dispatchEvent(event);

    expect(mockLogger.error).toHaveBeenCalledWith(
      {
        err: error,
        filename: 'test.js',
        lineno: 10,
        colno: 5,
      },
      'Unhandled Client Error',
    );
  });

  it('creates an Error when error event has no error object', () => {
    render(<GlobalErrorHandlers />);

    const event = new ErrorEvent('error', {
      message: 'Missing error object',
      filename: 'app.tsx',
      lineno: 1,
      colno: 2,
    });

    window.dispatchEvent(event);

    const logged = vi.mocked(mockLogger.error).mock.calls[0][0].err as Error;
    expect(logged).toBeInstanceOf(Error);
    expect(logged.message).toBe('Missing error object');
  });

  it('logs unhandled promise rejections', () => {
    render(<GlobalErrorHandlers />);

    const reason = new Error('Promise fail');
    const promise = Promise.reject(reason);
    promise.catch(() => undefined);
    const event = new PromiseRejectionEvent('unhandledrejection', {
      reason,
      promise,
    });

    window.dispatchEvent(event);

    expect(mockLogger.error).toHaveBeenCalledWith(
      {
        err: reason,
      },
      'Unhandled Promise Rejection',
    );
  });

  it('logs non-error promise rejections as error objects', () => {
    render(<GlobalErrorHandlers />);

    const promise = Promise.reject('String error');
    promise.catch(() => undefined);
    const event = new PromiseRejectionEvent('unhandledrejection', {
      reason: 'String error',
      promise,
    });

    window.dispatchEvent(event);

    expect(mockLogger.error).toHaveBeenCalledWith(
      {
        err: expect.any(Error),
      },
      'Unhandled Promise Rejection',
    );
    expect(vi.mocked(mockLogger.error).mock.calls[0][0].err.message).toBe(
      'String error',
    );
  });
});
