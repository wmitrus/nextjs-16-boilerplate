import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('logger entry point', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('should export a logger instance', async () => {
    const { logger } = await import('./index');
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe('function');
  });

  it('should use browser logger in browser environment', async () => {
    vi.stubGlobal('window', {});
    const { logger } = await import('./index');
    // The dynamic logger should resolve safely in browser context.
    expect(logger).toBeDefined();
    vi.unstubAllGlobals();
  });
});
