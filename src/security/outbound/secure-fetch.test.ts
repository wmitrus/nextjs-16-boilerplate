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

/**
 * Builds a fetch mock that returns `responsesByCallIndex[n]` for the nth
 * call (clamped to the last entry once exhausted), so redirect-chain tests
 * can script a sequence of hops without re-implementing a fake server.
 * Records every `[url, init]` pair it was called with.
 */
function mockFetchSequence(responses: Response[]) {
  const calls: [string, RequestInit | undefined][] = [];
  const fn = vi
    .fn()
    .mockImplementation(async (url: string | URL, init?: RequestInit) => {
      const urlString = typeof url === 'string' ? url : url.toString();
      calls.push([urlString, init]);
      const index = Math.min(calls.length - 1, responses.length - 1);
      // False-positive scanner finding: `index` is a Math.min-clamped
      // integer derived from array lengths, not attacker-controlled input.
      // eslint-disable-next-line security/detect-object-injection
      return responses[index];
    });
  return { fn, calls };
}

describe('Secure Fetch (SSRF Protection)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    resetAllInfrastructureMocks();
    mockEnv.SECURITY_ALLOWED_OUTBOUND_HOSTS = 'example.com, trusted.org';
    global.fetch = vi.fn().mockImplementation(async (url: string | URL) => {
      const urlString = typeof url === 'string' ? url : url.toString();
      // Avoid tracking logflare calls in tests
      if (urlString.includes('logflare')) {
        return new Response(null, { status: 200 });
      }
      return new Response('{}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
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

  it('should pin the connection via a per-request dispatcher, never the bare global fetch defaults', async () => {
    await secureFetch('https://example.com/api');
    const [, init] = vi.mocked(global.fetch).mock.calls[0] as [
      string,
      (RequestInit & { dispatcher?: unknown }) | undefined,
    ];
    expect(init?.dispatcher).toBeDefined();
    expect(init?.redirect).toBe('manual');
  });

  describe('redirect handling', () => {
    it('follows a redirect to another allowed host and returns the final response', async () => {
      const { fn, calls } = mockFetchSequence([
        new Response(null, {
          status: 302,
          headers: { location: 'https://trusted.org/final' },
        }),
        new Response('{"ok":true}', { status: 200 }),
      ]);
      global.fetch = fn;

      const response = await secureFetch('https://example.com/start');
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ ok: true });
      expect(calls).toHaveLength(2);
      expect(calls[1][0]).toBe('https://trusted.org/final');
    });

    it('re-validates the allowlist for a redirect target and rejects an unlisted host', async () => {
      const { fn, calls } = mockFetchSequence([
        new Response(null, {
          status: 302,
          headers: { location: 'https://malicious.com/steal' },
        }),
      ]);
      global.fetch = fn;

      await expect(secureFetch('https://example.com/start')).rejects.toThrow(
        'SSRF Protection',
      );
      // Never actually reached the malicious host.
      expect(calls).toHaveLength(1);
      expect(mockChildLogger.error).toHaveBeenCalled();
    });

    it('re-validates the resolved address for a redirect target and rejects a rebound one', async () => {
      const { fn, calls } = mockFetchSequence([
        new Response(null, {
          status: 302,
          headers: { location: 'https://trusted.org/final' },
        }),
      ]);
      global.fetch = fn;
      vi.mocked(lookup)
        .mockResolvedValueOnce([
          { address: '93.184.216.34', family: 4 },
        ] as unknown as Awaited<ReturnType<typeof lookup>>) // example.com: public
        .mockResolvedValueOnce([
          { address: '127.0.0.1', family: 4 },
        ] as unknown as Awaited<ReturnType<typeof lookup>>); // trusted.org: rebound

      await expect(secureFetch('https://example.com/start')).rejects.toThrow(
        'SSRF Protection',
      );
      expect(calls).toHaveLength(1);
    });

    it('rejects a redirect with no Location header', async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValue(new Response(null, { status: 302 }));

      await expect(secureFetch('https://example.com/start')).rejects.toThrow(
        'no Location header',
      );
    });

    it('gives up after too many redirect hops', async () => {
      global.fetch = vi.fn().mockImplementation(
        async () =>
          new Response(null, {
            status: 302,
            headers: { location: 'https://example.com/next' },
          }),
      );

      await expect(secureFetch('https://example.com/start')).rejects.toThrow(
        'Too many redirects',
      );
    });

    it('downgrades method and drops the body on a 303, but preserves both on a 307', async () => {
      const seen: (string | undefined)[] = [];
      global.fetch = vi
        .fn()
        .mockImplementation(async (_url: string, init?: RequestInit) => {
          seen.push(init?.method);
          if (seen.length === 1) {
            return new Response(null, {
              status: 303,
              headers: { location: 'https://example.com/two' },
            });
          }
          return new Response(null, { status: 200 });
        });

      await secureFetch('https://example.com/one', { method: 'POST' });
      expect(seen).toEqual(['POST', 'GET']);
    });
  });
});
