import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { useHydrationSafeState } from './useHydrationSafeState';

describe('useHydrationSafeState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns initial value immediately', () => {
    const { result } = renderHook(() => useHydrationSafeState('initial'));

    expect(result.current[0]).toBe('initial');
  });

  it('returns setState function as second element', () => {
    const { result } = renderHook(() => useHydrationSafeState('initial'));

    expect(typeof result.current[1]).toBe('function');
  });

  it('allows updating state with setState', async () => {
    const { result } = renderHook(() => useHydrationSafeState('initial'));

    expect(result.current[0]).toBe('initial');

    await act(async () => {
      result.current[1]('updated');
    });

    expect(result.current[0]).toBe('updated');
  });

  it('calls asyncInit on first client render', async () => {
    const asyncInit = vi.fn(async () => 'client-value');

    const { result } = renderHook(() =>
      useHydrationSafeState('initial', asyncInit),
    );

    expect(result.current[0]).toBe('initial');

    await waitFor(() => {
      expect(asyncInit).toHaveBeenCalled();
    });
  });

  it('updates state with asyncInit result', async () => {
    const asyncInit = vi.fn(async () => 'client-value');

    const { result } = renderHook(() =>
      useHydrationSafeState('initial', asyncInit),
    );

    expect(result.current[0]).toBe('initial');

    await waitFor(() => {
      expect(result.current[0]).toBe('client-value');
    });
  });

  it('does not call asyncInit if not provided', async () => {
    const asyncInit = vi.fn();

    const { result } = renderHook(() => useHydrationSafeState('value'));

    expect(result.current[0]).toBe('value');

    // Even after a delay, asyncInit should not be called
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    expect(asyncInit).not.toHaveBeenCalled();
  });

  it('only calls asyncInit once on mount', async () => {
    const asyncInit = vi.fn(async () => 'client-value');

    const { result, rerender } = renderHook(
      ({ init }) => useHydrationSafeState('initial', init),
      { initialProps: { init: asyncInit } },
    );

    await waitFor(() => {
      expect(result.current[0]).toBe('client-value');
    });

    expect(asyncInit).toHaveBeenCalledTimes(1);

    // Rerender with new asyncInit function
    const newAsyncInit = vi.fn(async () => 'new-value');
    rerender({ init: newAsyncInit });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(asyncInit).toHaveBeenCalledTimes(1);
    expect(newAsyncInit).not.toHaveBeenCalled();
  });

  it('handles asyncInit errors gracefully', async () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const asyncInit = vi.fn(async () => {
      throw new Error('Init failed');
    });

    const { result } = renderHook(() =>
      useHydrationSafeState('initial', asyncInit),
    );

    expect(result.current[0]).toBe('initial');

    await waitFor(() => {
      expect(asyncInit).toHaveBeenCalled();
    });

    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(result.current[0]).toBe('initial');

    consoleErrorSpy.mockRestore();
  });

  it('works with different value types', async () => {
    const { result: numberResult } = renderHook(() =>
      useHydrationSafeState(42),
    );
    expect(numberResult.current[0]).toBe(42);

    const { result: boolResult } = renderHook(() =>
      useHydrationSafeState(false),
    );
    expect(boolResult.current[0]).toBe(false);

    const { result: arrayResult } = renderHook(() =>
      useHydrationSafeState([1, 2, 3]),
    );
    expect(arrayResult.current[0]).toEqual([1, 2, 3]);

    const { result: objectResult } = renderHook(() =>
      useHydrationSafeState({ a: 1 }),
    );
    expect(objectResult.current[0]).toEqual({ a: 1 });
  });

  it('supports setState with updater function', async () => {
    const { result } = renderHook(() => useHydrationSafeState(5));

    expect(result.current[0]).toBe(5);

    await act(async () => {
      result.current[1]((prev) => prev + 10);
    });

    expect(result.current[0]).toBe(15);
  });

  it('prevents hydration mismatch by using initial value first', async () => {
    const asyncInit = vi.fn(async () => 'different');

    const { result } = renderHook(() =>
      useHydrationSafeState('server-value', asyncInit),
    );

    // Immediately (during hydration), should match server
    expect(result.current[0]).toBe('server-value');

    // After hydration completes
    await waitFor(() => {
      expect(result.current[0]).toBe('different');
    });
  });
});
