import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('rate-limit-helper', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    // Mocking env
    vi.doMock('@/core/env', () => ({
      env: {
        API_RATE_LIMIT_REQUESTS: 10,
        API_RATE_LIMIT_WINDOW: '60 s',
      },
    }));
  });

  describe('checkRateLimit', () => {
    it('should use localRateLimit when apiRateLimit is undefined', async () => {
      vi.doMock('./rate-limit', () => ({
        apiRateLimit: undefined,
        checkUpstashRateLimit: vi.fn(),
      }));

      const { checkRateLimit } = await import('./rate-limit-helper');
      const result = await checkRateLimit('test-ip');

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.limit).toBe(10);
    });

    it('should use checkUpstashRateLimit when apiRateLimit is defined', async () => {
      const mockCheckUpstashRateLimit = vi.fn();
      vi.doMock('./rate-limit', () => ({
        apiRateLimit: {}, // truthy
        checkUpstashRateLimit: mockCheckUpstashRateLimit,
      }));

      const mockResult = {
        success: true,
        limit: 100,
        remaining: 99,
        reset: new Date(),
      };
      mockCheckUpstashRateLimit.mockResolvedValue(mockResult);

      const { checkRateLimit } = await import('./rate-limit-helper');
      const result = await checkRateLimit('upstash-ip');

      expect(mockCheckUpstashRateLimit).toHaveBeenCalledWith('upstash-ip');
      expect(result).toEqual(mockResult);
    });

    it('should fallback to localRateLimit when Upstash check throws', async () => {
      vi.doMock('./rate-limit', () => ({
        apiRateLimit: {}, // truthy
        checkUpstashRateLimit: vi
          .fn()
          .mockRejectedValue(new Error('Upstash unavailable')),
      }));

      const { checkRateLimit } = await import('./rate-limit-helper');
      const result = await checkRateLimit('fallback-ip');

      expect(result.success).toBe(true);
      expect(result.limit).toBe(10);
    });

    it('should fallback to localRateLimit when Upstash check times out', async () => {
      vi.useFakeTimers();

      vi.doMock('./rate-limit', () => ({
        apiRateLimit: {}, // truthy
        checkUpstashRateLimit: vi.fn(() => new Promise(() => {})),
      }));

      const { checkRateLimit, UPSTASH_RATE_LIMIT_TIMEOUT_MS } =
        await import('./rate-limit-helper');
      const pending = checkRateLimit('timeout-ip');

      await vi.advanceTimersByTimeAsync(UPSTASH_RATE_LIMIT_TIMEOUT_MS + 1);
      const result = await pending;

      expect(result.success).toBe(true);
      expect(result.limit).toBe(10);

      vi.useRealTimers();
    });
  });

  it('should handle different window formats via local fallback', async () => {
    vi.doMock('./rate-limit', () => ({
      apiRateLimit: undefined,
      checkUpstashRateLimit: vi.fn(),
    }));

    const { checkRateLimit } = await import('./rate-limit-helper');
    const result = await checkRateLimit('test-ip-2');
    expect(result.success).toBe(true);
  });

  describe('parseDurationToMs', () => {
    it('should parse seconds', async () => {
      const { parseDurationToMs } = await import('./rate-limit-helper');
      expect(parseDurationToMs('10 s')).toBe(10000);
      expect(parseDurationToMs('10 sec')).toBe(10000);
      expect(parseDurationToMs('10 second')).toBe(10000);
      expect(parseDurationToMs('10 seconds')).toBe(10000);
    });

    it('should parse minutes', async () => {
      const { parseDurationToMs } = await import('./rate-limit-helper');
      expect(parseDurationToMs('1 m')).toBe(60000);
      expect(parseDurationToMs('1 min')).toBe(60000);
      expect(parseDurationToMs('1 minute')).toBe(60000);
      expect(parseDurationToMs('1 minutes')).toBe(60000);
    });

    it('should parse hours', async () => {
      const { parseDurationToMs } = await import('./rate-limit-helper');
      expect(parseDurationToMs('1 h')).toBe(3600000);
      expect(parseDurationToMs('1 hr')).toBe(3600000);
      expect(parseDurationToMs('1 hour')).toBe(3600000);
      expect(parseDurationToMs('1 hours')).toBe(3600000);
    });

    it('should parse days', async () => {
      const { parseDurationToMs } = await import('./rate-limit-helper');
      expect(parseDurationToMs('1 d')).toBe(86400000);
      expect(parseDurationToMs('1 day')).toBe(86400000);
      expect(parseDurationToMs('1 days')).toBe(86400000);
    });

    it('should default to seconds for unknown units', async () => {
      const { parseDurationToMs } = await import('./rate-limit-helper');
      expect(parseDurationToMs('10 unknown')).toBe(10000);
    });
  });
  describe('checkRateLimit meta.path propagation', () => {
    it('should include path in warn log context when Upstash times out and meta.path is provided', async () => {
      vi.useFakeTimers();

      const mockWarn = vi.fn();
      vi.doMock('@/core/logger/di-edge', () => ({
        resolveEdgeLogger: () => ({ warn: mockWarn }),
      }));
      vi.doMock('./rate-limit', () => ({
        apiRateLimit: {},
        checkUpstashRateLimit: vi.fn(() => new Promise(() => {})),
      }));

      const { checkRateLimit, UPSTASH_RATE_LIMIT_TIMEOUT_MS } =
        await import('./rate-limit-helper');

      const pending = checkRateLimit('192.168.1.1', { path: '/api/logs' });
      await vi.advanceTimersByTimeAsync(UPSTASH_RATE_LIMIT_TIMEOUT_MS + 1);
      await pending;

      expect(mockWarn).toHaveBeenCalledWith(
        expect.objectContaining({ path: '/api/logs' }),
        expect.any(String),
      );

      vi.useRealTimers();
    });

    it('should not include path in warn log context when meta is omitted', async () => {
      vi.useFakeTimers();

      const mockWarn = vi.fn();
      vi.doMock('@/core/logger/di-edge', () => ({
        resolveEdgeLogger: () => ({ warn: mockWarn }),
      }));
      vi.doMock('./rate-limit', () => ({
        apiRateLimit: {},
        checkUpstashRateLimit: vi.fn(() => new Promise(() => {})),
      }));

      const { checkRateLimit, UPSTASH_RATE_LIMIT_TIMEOUT_MS } =
        await import('./rate-limit-helper');

      const pending = checkRateLimit('192.168.1.2');
      await vi.advanceTimersByTimeAsync(UPSTASH_RATE_LIMIT_TIMEOUT_MS + 1);
      await pending;

      expect(mockWarn).toHaveBeenCalledWith(
        expect.not.objectContaining({ path: expect.anything() }),
        expect.any(String),
      );

      vi.useRealTimers();
    });

    it('should log errorMessage and errorName instead of raw error object', async () => {
      vi.useFakeTimers();

      const mockWarn = vi.fn();
      vi.doMock('@/core/logger/di-edge', () => ({
        resolveEdgeLogger: () => ({ warn: mockWarn }),
      }));
      vi.doMock('./rate-limit', () => ({
        apiRateLimit: {},
        checkUpstashRateLimit: vi.fn(() => new Promise(() => {})),
      }));

      const { checkRateLimit, UPSTASH_RATE_LIMIT_TIMEOUT_MS } =
        await import('./rate-limit-helper');

      const pending = checkRateLimit('192.168.1.3', { path: '/api/data' });
      await vi.advanceTimersByTimeAsync(UPSTASH_RATE_LIMIT_TIMEOUT_MS + 1);
      await pending;

      expect(mockWarn).toHaveBeenCalledWith(
        expect.objectContaining({
          errorMessage: expect.any(String),
          errorName: expect.any(String),
        }),
        expect.any(String),
      );
      expect(mockWarn).toHaveBeenCalledWith(
        expect.not.objectContaining({ error: expect.anything() }),
        expect.any(String),
      );

      vi.useRealTimers();
    });
  });

  /**
   * SEC-42. Strict mode exists because the process-local fallback is
   * per-instance on serverless: an attacker spread across instances gets the
   * limit once per instance. These assert the chain, and specifically that
   * nothing which merely *fails* can put the caller back on that fallback.
   */
  describe("checkRateLimit mode: 'strict'", () => {
    type Increment = (
      identifier: string,
      windowMs: number,
    ) => Promise<{ count: number; windowEnd: Date }>;

    function makeDeps(overrides?: {
      increment?: Increment;
      isDegradeSwitchOn?: () => Promise<boolean>;
    }) {
      const increment = vi.fn<Increment>(
        overrides?.increment ??
          (async () => ({
            count: 1,
            windowEnd: new Date(Date.now() + 60_000),
          })),
      );
      const isDegradeSwitchOn = vi.fn<() => Promise<boolean>>(
        overrides?.isDegradeSwitchOn ?? (async () => false),
      );
      return { durable: { increment }, isDegradeSwitchOn };
    }

    async function importHelper(upstash: 'throws' | 'absent') {
      // A full EdgeLogger stub. Earlier tests in this file register a
      // `{ warn }`-only logger via `vi.doMock`, and those registrations
      // outlive `vi.resetModules()` -- so the strict paths, which also log at
      // `error`, would otherwise fail on the leftover stub rather than on
      // anything real.
      vi.doMock('@/core/logger/di-edge', () => ({
        resolveEdgeLogger: () => ({
          debug: vi.fn(),
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
        }),
      }));
      vi.doMock('./rate-limit', () => ({
        apiRateLimit: upstash === 'absent' ? undefined : {},
        checkUpstashRateLimit: vi
          .fn()
          .mockRejectedValue(new Error('upstash down')),
      }));
      return import('./rate-limit-helper');
    }

    it('serves the request from the durable secondary when Upstash is down', async () => {
      const { checkRateLimit } = await importHelper('throws');
      const deps = makeDeps();

      const result = await checkRateLimit('ip-1', {
        mode: 'strict',
        strict: deps,
      });

      expect(deps.durable.increment).toHaveBeenCalledWith('ip-1', 60_000);
      expect(result.success).toBe(true);
      expect(result.remaining).toBe(9);
    });

    it('rejects once the durable count passes the limit', async () => {
      const { checkRateLimit } = await importHelper('throws');
      const deps = makeDeps({
        increment: async () => ({
          count: 11,
          windowEnd: new Date(Date.now() + 60_000),
        }),
      });

      const result = await checkRateLimit('ip-1', {
        mode: 'strict',
        strict: deps,
      });

      expect(result.success).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('treats a count exactly at the limit as still allowed', async () => {
      const { checkRateLimit } = await importHelper('throws');
      const deps = makeDeps({
        increment: async () => ({
          count: 10,
          windowEnd: new Date(Date.now() + 60_000),
        }),
      });

      const result = await checkRateLimit('ip-1', {
        mode: 'strict',
        strict: deps,
      });

      expect(result.success).toBe(true);
      expect(result.remaining).toBe(0);
    });

    it('fails CLOSED when both stores are unavailable', async () => {
      const { checkRateLimit } = await importHelper('throws');
      const deps = makeDeps({
        increment: async () => {
          throw new Error('postgres down');
        },
      });

      const result = await checkRateLimit('ip-1', {
        mode: 'strict',
        strict: deps,
      });

      expect(result.success).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('does NOT fall back to the process-local counter on a double outage', async () => {
      // The whole point of strict mode. If this ever regresses, the control
      // silently becomes per-instance again and every other assertion here
      // still passes.
      const { checkRateLimit } = await importHelper('throws');
      const deps = makeDeps({
        increment: async () => {
          throw new Error('postgres down');
        },
      });

      // Ten calls that would each be allowed by a fresh local bucket.
      const results = await Promise.all(
        Array.from({ length: 10 }, () =>
          checkRateLimit('ip-shared', { mode: 'strict', strict: deps }),
        ),
      );

      expect(results.every((r) => r.success === false)).toBe(true);
    });

    it('degrades to the local counter only when the switch says so', async () => {
      const { checkRateLimit } = await importHelper('throws');
      const deps = makeDeps({
        increment: async () => {
          throw new Error('postgres down');
        },
        isDegradeSwitchOn: async () => true,
      });

      const result = await checkRateLimit('ip-2', {
        mode: 'strict',
        strict: deps,
      });

      expect(result.success).toBe(true);
    });

    it('still uses the durable secondary when Upstash is not configured at all', async () => {
      // A production deployment with no Upstash must not quietly downgrade a
      // security-critical limit to a per-instance Map.
      const { checkRateLimit } = await importHelper('absent');
      const deps = makeDeps();

      const result = await checkRateLimit('ip-3', {
        mode: 'strict',
        strict: deps,
      });

      expect(deps.durable.increment).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('fails closed when strict is requested with no durable store wired', async () => {
      const { checkRateLimit } = await importHelper('throws');

      const result = await checkRateLimit('ip-4', { mode: 'strict' });

      expect(result.success).toBe(false);
    });

    it('leaves standard mode on the local fallback, unchanged', async () => {
      const { checkRateLimit } = await importHelper('throws');

      const result = await checkRateLimit('ip-5');

      expect(result.success).toBe(true);
      expect(result.limit).toBe(10);
    });
  });
});
