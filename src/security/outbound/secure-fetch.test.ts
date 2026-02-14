/** @vitest-environment node */
import '@/testing/infrastructure/env';
import '@/testing/infrastructure/logger';

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { secureFetch } from './secure-fetch';

import { mockEnv, mockLogger, resetAllInfrastructureMocks } from '@/testing';

describe('Secure Fetch (SSRF Protection)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    resetAllInfrastructureMocks();
    mockEnv.SECURITY_ALLOWED_OUTBOUND_HOSTS = 'example.com, trusted.org';
    global.fetch = vi.fn().mockImplementation(async (url: string | URL) => {
      const urlString = typeof url === 'string' ? url : url.toString();
      // Avoid tracking logflare calls in tests
      if (urlString.includes('logflare')) {
        return { ok: true } as Response;
      }
      return {
        ok: true,
        json: () => Promise.resolve({}),
        text: () => Promise.resolve(''),
      } as Response;
    });
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('should allow requests to explicitly allowed hosts', async () => {
    await expect(secureFetch('https://example.com/api')).resolves.toBeDefined();
    // Filter out logflare calls if any
    const calls = vi
      .mocked(global.fetch)
      .mock.calls.filter((call) => !String(call[0]).includes('logflare'));
    expect(calls.length).toBeGreaterThan(0);
  });

  it('should allow requests to core allowed hosts (clerk)', async () => {
    await expect(
      secureFetch('https://api.clerk.com/v1'),
    ).resolves.toBeDefined();
    const calls = vi
      .mocked(global.fetch)
      .mock.calls.filter((call) => !String(call[0]).includes('logflare'));
    expect(calls.length).toBeGreaterThan(0);
  });

  it('should block requests to untrusted hosts', async () => {
    await expect(secureFetch('https://malicious.com')).rejects.toThrow(
      'SSRF Protection',
    );
    // Filter out logflare calls
    const calls = vi
      .mocked(global.fetch)
      .mock.calls.filter((call) => !String(call[0]).includes('logflare'));
    expect(calls.length).toBe(0);
    expect(mockLogger.error).toHaveBeenCalled();
  });

  it('should block requests to private IPs', async () => {
    await expect(secureFetch('http://192.168.1.1')).rejects.toThrow(
      'SSRF Protection',
    );
    await expect(secureFetch('http://localhost:3000')).rejects.toThrow(
      'SSRF Protection',
    );
  });

  it('should allow subdomains of allowed hosts', async () => {
    await expect(secureFetch('https://api.example.com')).resolves.toBeDefined();
  });
});
