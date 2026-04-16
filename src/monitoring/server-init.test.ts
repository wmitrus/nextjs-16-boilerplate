// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalEnv = process.env;

describe('initializeServerObservability', () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.resetModules();
  });

  it('logs and skips when New Relic is disabled', async () => {
    process.env.NEW_RELIC_ENABLED = 'false';
    delete process.env.NEW_RELIC_LICENSE_KEY;
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { initializeServerObservability } = await import('./server-init');
    await initializeServerObservability();

    expect(infoSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'Skipping server init because NEW_RELIC_ENABLED=false',
      ),
    );
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('logs and skips when license key is blank', async () => {
    process.env.NEW_RELIC_ENABLED = 'true';
    process.env.NEW_RELIC_LICENSE_KEY = '   ';
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { initializeServerObservability } = await import('./server-init');
    await initializeServerObservability();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('NEW_RELIC_LICENSE_KEY is missing or blank'),
    );
  });
});
