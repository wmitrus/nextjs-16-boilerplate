import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { useAsyncHandler } from './useAsyncHandler';

const mockLogger = vi.hoisted(() => ({
  error: vi.fn(),
}));

const mockSentry = vi.hoisted(() => ({
  captureException: vi.fn(),
}));

vi.mock('@/core/logger/browser', () => ({
  getBrowserLogger: vi.fn(() => mockLogger),
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: mockSentry.captureException,
}));

describe('useAsyncHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('returns handler, isLoading, and error', () => {
    const { result } = renderHook(() => useAsyncHandler(async () => null));

    expect(result.current).toHaveProperty('handler');
    expect(result.current).toHaveProperty('isLoading');
    expect(result.current).toHaveProperty('error');
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('calls the callback when handler is invoked', async () => {
    const callback = vi.fn(async () => 'success');
    const { result } = renderHook(() => useAsyncHandler(callback));

    await act(async () => {
      result.current.handler();
      await waitFor(() => expect(result.current.isLoading).toBe(false));
    });

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('sets isLoading during async operation', async () => {
    const callback = vi.fn(
      () => new Promise((resolve) => setTimeout(resolve, 100)),
    );
    const { result } = renderHook(() => useAsyncHandler(callback));

    expect(result.current.isLoading).toBe(false);

    act(() => {
      result.current.handler();
    });

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
  });

  it('calls onSuccess callback when async operation succeeds', async () => {
    const onSuccess = vi.fn();
    const callback = vi.fn(async () => 'result');
    const { result } = renderHook(() =>
      useAsyncHandler(callback, { onSuccess }),
    );

    await act(async () => {
      result.current.handler();
      await waitFor(() => expect(result.current.isLoading).toBe(false));
    });

    expect(onSuccess).toHaveBeenCalledWith('result');
  });

  it('catches errors and logs them', async () => {
    const testError = new Error('Test error');
    const callback = vi.fn(async () => {
      throw testError;
    });
    const { result } = renderHook(() => useAsyncHandler(callback));

    await act(async () => {
      result.current.handler();
      await waitFor(() => expect(result.current.error).not.toBeNull());
    });

    expect(result.current.error).toBe(testError);
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        err: testError,
        context: 'useAsyncHandler',
      }),
      'Async handler error',
    );
  });

  it('sends errors to Sentry', async () => {
    const testError = new Error('Test error');
    const callback = vi.fn(async () => {
      throw testError;
    });
    const { result } = renderHook(() => useAsyncHandler(callback));

    await act(async () => {
      result.current.handler();
      await waitFor(() => expect(result.current.error).not.toBeNull());
    });

    expect(mockSentry.captureException).toHaveBeenCalledWith(testError);
  });

  it('calls onError callback when async operation fails', async () => {
    const onError = vi.fn();
    const testError = new Error('Test error');
    const callback = vi.fn(async () => {
      throw testError;
    });
    const { result } = renderHook(() => useAsyncHandler(callback, { onError }));

    await act(async () => {
      result.current.handler();
      await waitFor(() => expect(result.current.error).not.toBeNull());
    });

    expect(onError).toHaveBeenCalledWith(testError);
  });

  it('clears error after 5 seconds', async () => {
    const callback = vi.fn(async () => {
      throw new Error('Test error');
    });
    const { result } = renderHook(() => useAsyncHandler(callback));

    await act(async () => {
      result.current.handler();
      await waitFor(() => expect(result.current.error).not.toBeNull());
    });

    expect(result.current.error).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(result.current.error).toBeNull();
  });

  it('prevents duplicate calls by default', async () => {
    const callback = vi.fn(
      () => new Promise((resolve) => setTimeout(resolve, 100)),
    );
    const { result } = renderHook(() => useAsyncHandler(callback));

    act(() => {
      result.current.handler();
      result.current.handler();
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('allows duplicate calls when preventDuplicates is false', async () => {
    const callback = vi.fn(async () => 'success');
    const { result } = renderHook(() =>
      useAsyncHandler(callback, { preventDuplicates: false }),
    );

    await act(async () => {
      result.current.handler();
      result.current.handler();
      await waitFor(() => expect(callback).toHaveBeenCalledTimes(2));
    });

    expect(callback).toHaveBeenCalledTimes(2);
  });

  it('converts non-Error throws to Error objects', async () => {
    const callback = vi.fn(async () => {
      throw 'string error';
    });
    const { result } = renderHook(() => useAsyncHandler(callback));

    await act(async () => {
      result.current.handler();
      await waitFor(() => expect(result.current.error).not.toBeNull());
    });

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe('string error');
  });
});
