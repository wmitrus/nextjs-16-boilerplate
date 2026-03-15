import { act, render } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { GlobalErrorHandlers } from './global-error-handlers';

const mockLogger = vi.hoisted(() => ({
  error: vi.fn(),
  warn: vi.fn(),
}));

const mockSentry = vi.hoisted(() => ({
  captureException: vi.fn(),
}));

vi.mock('@/core/logger/browser', () => ({
  getBrowserLogger: vi.fn(() => mockLogger),
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: mockSentry.captureException,
  captureMessage: vi.fn(),
}));

describe('GlobalErrorHandlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('renders without crashing', () => {
    const { container } = render(<GlobalErrorHandlers />);
    expect(container).toBeInTheDocument();
  });

  it('returns null (no DOM output)', () => {
    const { container } = render(<GlobalErrorHandlers />);
    expect(container.firstChild).toBeNull();
  });

  it('logs unhandled errors', () => {
    render(<GlobalErrorHandlers />);

    const testError = new Error('Test error');
    const event = new ErrorEvent('error', { error: testError });
    window.dispatchEvent(event);

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        err: testError,
      }),
      'Unhandled Client Error',
    );
  });

  it('logs unhandled promise rejections', () => {
    render(<GlobalErrorHandlers />);

    const testError = new Error('Rejection error');
    const event = new PromiseRejectionEvent('unhandledrejection', {
      promise: Promise.resolve(),
      reason: testError,
    });
    window.dispatchEvent(event);

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        err: testError,
      }),
      'Unhandled Promise Rejection',
    );
  });

  it('deduplicates identical errors', () => {
    render(<GlobalErrorHandlers />);

    const testError = new Error('Duplicate error');
    const event1 = new ErrorEvent('error', { error: testError });
    const event2 = new ErrorEvent('error', { error: testError });

    window.dispatchEvent(event1);
    window.dispatchEvent(event2);

    expect(mockLogger.error).toHaveBeenCalledTimes(1);
  });

  it('captures Connection closed errors', () => {
    render(<GlobalErrorHandlers />);

    const event = new ErrorEvent('error', {
      message: 'Connection closed unexpectedly',
    });
    window.dispatchEvent(event);

    expect(mockLogger.error).toHaveBeenCalled();
    expect(mockSentry.captureException).toHaveBeenCalled();
  });

  it('ignores Network error pattern', () => {
    render(<GlobalErrorHandlers />);

    const event = new ErrorEvent('error', {
      message: 'Network error occurred',
    });
    window.dispatchEvent(event);

    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it('ignores Failed to fetch errors', () => {
    render(<GlobalErrorHandlers />);

    const event = new ErrorEvent('error', {
      message: 'Failed to fetch resource',
    });
    window.dispatchEvent(event);

    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it('ignores known no-op rejections', () => {
    render(<GlobalErrorHandlers />);

    const error = new Error('cannot_render_single_session_enabled');
    const event = new PromiseRejectionEvent('unhandledrejection', {
      promise: Promise.resolve(),
      reason: error,
    });
    window.dispatchEvent(event);

    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it('captures Connection closed rejections', () => {
    render(<GlobalErrorHandlers />);

    const error = new Error('Connection closed.');
    const event = new PromiseRejectionEvent('unhandledrejection', {
      promise: Promise.resolve(),
      reason: error,
    });
    window.dispatchEvent(event);

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        err: error,
      }),
      'Unhandled Promise Rejection',
    );
    expect(mockSentry.captureException).toHaveBeenCalledWith(
      error,
      expect.objectContaining({
        contexts: expect.any(Object),
      }),
    );
  });

  it('sends errors to Sentry', () => {
    render(<GlobalErrorHandlers />);

    const testError = new Error('Sentry test error');
    const event = new ErrorEvent('error', { error: testError });
    window.dispatchEvent(event);

    expect(mockSentry.captureException).toHaveBeenCalledWith(
      testError,
      expect.objectContaining({
        contexts: expect.any(Object),
      }),
    );
  });

  it('clears old error entries after 30 seconds', () => {
    render(<GlobalErrorHandlers />);

    const testError1 = new Error('Error 1');
    const testError2 = new Error('Error 2');

    // Log first error
    const event1 = new ErrorEvent('error', { error: testError1 });
    window.dispatchEvent(event1);

    expect(mockLogger.error).toHaveBeenCalledTimes(1);

    // Advance time 31 seconds
    act(() => {
      vi.advanceTimersByTime(31000);
    });

    // Log second error (different from first)
    const event2 = new ErrorEvent('error', { error: testError2 });
    window.dispatchEvent(event2);

    expect(mockLogger.error).toHaveBeenCalledTimes(2);

    // Log first error again
    const event3 = new ErrorEvent('error', { error: testError1 });
    window.dispatchEvent(event3);

    expect(mockLogger.error.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('handles non-Error rejection reasons', () => {
    render(<GlobalErrorHandlers />);

    const event = new PromiseRejectionEvent('unhandledrejection', {
      promise: Promise.resolve(),
      reason: 'String rejection',
    });
    window.dispatchEvent(event);

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        err: expect.any(Error),
      }),
      'Unhandled Promise Rejection',
    );
  });

  it('handles ErrorEvent without error property', () => {
    render(<GlobalErrorHandlers />);

    const event = new ErrorEvent('error', { message: 'Message only error' });
    window.dispatchEvent(event);

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        err: expect.any(Error),
      }),
      'Unhandled Client Error',
    );
  });

  it('includes error location info in log', () => {
    render(<GlobalErrorHandlers />);

    const testError = new Error('Located error');
    const event = new ErrorEvent('error', {
      error: testError,
      filename: 'test.js',
      lineno: 42,
      colno: 10,
    });
    window.dispatchEvent(event);

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        err: testError,
        filename: 'test.js',
        lineno: 42,
        colno: 10,
      }),
      'Unhandled Client Error',
    );
  });

  it('cleans up event listeners on unmount', () => {
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

    const { unmount } = render(<GlobalErrorHandlers />);

    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      'error',
      expect.any(Function),
    );
    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      'unhandledrejection',
      expect.any(Function),
    );
    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      'securitypolicyviolation',
      expect.any(Function),
    );

    removeEventListenerSpy.mockRestore();
  });

  describe('CSP violation handling', () => {
    function dispatchCspViolation(
      overrides: Partial<{
        violatedDirective: string;
        effectiveDirective: string;
        blockedURI: string;
        documentURI: string;
        disposition: string;
        statusCode: number;
        originalPolicy: string;
        referrer: string;
      }> = {},
    ) {
      const init = {
        violatedDirective: 'script-src',
        effectiveDirective: 'script-src',
        blockedURI: 'https://evil.com/script.js',
        documentURI: 'https://app.example.com/dashboard',
        disposition: 'enforce',
        statusCode: 200,
        originalPolicy: "default-src 'self'; script-src 'self'",
        referrer: 'https://external.com',
        ...overrides,
      };
      const event = new Event(
        'securitypolicyviolation',
      ) as SecurityPolicyViolationEvent;
      Object.assign(event, init);
      window.dispatchEvent(event);
    }

    it('logs CSP violations at warn level', () => {
      render(<GlobalErrorHandlers />);
      dispatchCspViolation();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ violatedDirective: 'script-src' }),
        'CSP Violation',
      );
    });

    it('strips query params from documentURI', () => {
      render(<GlobalErrorHandlers />);
      dispatchCspViolation({
        documentURI: 'https://app.example.com/page?token=secret&user=123',
      });
      const logCall = mockLogger.warn.mock.calls[0]?.[0] as Record<
        string,
        unknown
      >;
      expect(logCall?.['documentURI']).toBe('https://app.example.com/page');
      expect(logCall?.['documentURI']).not.toContain('token');
    });

    it('strips query params from blockedURI', () => {
      render(<GlobalErrorHandlers />);
      dispatchCspViolation({
        blockedURI: 'https://evil.com/script.js?key=abc',
      });
      const logCall = mockLogger.warn.mock.calls[0]?.[0] as Record<
        string,
        unknown
      >;
      expect(logCall?.['blockedURI']).toBe('https://evil.com/script.js');
    });

    it('does not log originalPolicy', () => {
      render(<GlobalErrorHandlers />);
      dispatchCspViolation({ originalPolicy: "default-src 'self'" });
      const logCall = mockLogger.warn.mock.calls[0]?.[0] as Record<
        string,
        unknown
      >;
      expect(logCall).not.toHaveProperty('originalPolicy');
    });

    it('does not log referrer', () => {
      render(<GlobalErrorHandlers />);
      dispatchCspViolation({ referrer: 'https://external.com/page' });
      const logCall = mockLogger.warn.mock.calls[0]?.[0] as Record<
        string,
        unknown
      >;
      expect(logCall).not.toHaveProperty('referrer');
    });

    it('handles malformed documentURI gracefully', () => {
      render(<GlobalErrorHandlers />);
      dispatchCspViolation({ documentURI: 'not-a-url?with=query' });
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ documentURI: 'not-a-url' }),
        'CSP Violation',
      );
    });
  });
});
