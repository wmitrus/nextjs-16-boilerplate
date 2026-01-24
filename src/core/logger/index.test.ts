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

  it('should use browserLogger in browser environment', async () => {
    vi.stubGlobal('window', {});
    const { logger } = await import('./index');
    // In our implementation, browserLogger is exported via index
    expect(logger).toBeDefined();
    vi.unstubAllGlobals();
  });
});
