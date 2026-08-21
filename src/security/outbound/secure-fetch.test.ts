/** @vitest-environment node */
import '@/testing/infrastructure/env';
import '@/testing/infrastructure/logger';

import { lookup } from 'node:dns/promises';

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { secureFetch } from './secure-fetch';

import {
  mockEnv,
  mockChildLogger,
  resetAllInfrastructureMocks,
} from '@/testing';

vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(),
}));

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
    // Default DNS resolution: any allowed hostname resolves to a public
    // address. Individual tests override this to simulate rebinding/failure.
    vi.mocked(lookup)
      .mockReset()
      .mockResolvedValue(
        // The `{ all: true }` overload resolves to LookupAddress[], but
        // vi.mocked() infers the single-result overload — cast through
        // unknown to match the array shape actually used at the call site.
        [{ address: '93.184.216.34', family: 4 }] as unknown as Awaited<
          ReturnType<typeof lookup>
        >,
      );
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

  it('should allow requests to core allowed hosts', async () => {
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
    expect(mockChildLogger.error).toHaveBeenCalled();
  });

  it('should block requests to private IPs', async () => {
    await expect(secureFetch('http://192.168.1.1')).rejects.toThrow(
      'SSRF Protection',
    );
    await expect(secureFetch('http://localhost:3000')).rejects.toThrow(
      'SSRF Protection',
    );
  });

  it('should allow requests to clerk.accounts.dev when using a dev Clerk key', async () => {
    mockEnv.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_test_devkey123';
    await expect(
      secureFetch('https://frontend-api.clerk.accounts.dev/v1'),
    ).resolves.toBeDefined();
  });

  it('should block requests to clerk.accounts.dev when using a production Clerk key', async () => {
    mockEnv.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_live_prodkey123';
    await expect(
      secureFetch('https://frontend-api.clerk.accounts.dev/v1'),
    ).rejects.toThrow('SSRF Protection');
    expect(mockChildLogger.error).toHaveBeenCalled();
  });
  it('should allow subdomains of allowed hosts', async () => {
    await expect(secureFetch('https://api.example.com')).resolves.toBeDefined();
  });

  it('should block IPv6 loopback, link-local, and 0.0.0.0/169.254 addresses even if allowlisted', async () => {
    mockEnv.SECURITY_ALLOWED_OUTBOUND_HOSTS =
      '::1, fe80::1, 169.254.169.254, 0.0.0.0';
    await expect(secureFetch('http://[::1]')).rejects.toThrow(
      'SSRF Protection',
    );
    await expect(secureFetch('http://[fe80::1]')).rejects.toThrow(
      'SSRF Protection',
    );
    await expect(secureFetch('http://169.254.169.254')).rejects.toThrow(
      'SSRF Protection',
    );
    await expect(secureFetch('http://0.0.0.0')).rejects.toThrow(
      'SSRF Protection',
    );
  });

  it('should block an IPv4-mapped IPv6 address pointing at a private range', async () => {
    mockEnv.SECURITY_ALLOWED_OUTBOUND_HOSTS = '::ffff:10.0.0.5';
    await expect(secureFetch('http://[::ffff:10.0.0.5]')).rejects.toThrow(
      'SSRF Protection',
    );
  });

  it('should block a hostname that resolves to a private address (DNS rebinding)', async () => {
    vi.mocked(lookup).mockResolvedValueOnce([
      { address: '127.0.0.1', family: 4 },
    ] as unknown as Awaited<ReturnType<typeof lookup>>);
    await expect(secureFetch('https://example.com/api')).rejects.toThrow(
      'SSRF Protection',
    );
    expect(mockChildLogger.error).toHaveBeenCalled();
  });

  it('should fail closed when DNS resolution errors', async () => {
    vi.mocked(lookup).mockRejectedValueOnce(new Error('ENOTFOUND'));
    await expect(secureFetch('https://example.com/api')).rejects.toThrow(
      'SSRF Protection',
    );
  });

  it('should skip DNS resolution for literal IP hosts', async () => {
    mockEnv.SECURITY_ALLOWED_OUTBOUND_HOSTS = '203.0.113.10';
    await expect(secureFetch('http://203.0.113.10')).resolves.toBeDefined();
    expect(lookup).not.toHaveBeenCalled();
  });
});
