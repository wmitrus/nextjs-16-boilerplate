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
});
