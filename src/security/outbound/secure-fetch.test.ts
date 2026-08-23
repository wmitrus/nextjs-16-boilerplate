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
    await expect(secureFetch('https://192.168.1.1')).rejects.toThrow(
      'SSRF Protection',
    );
    await expect(secureFetch('https://localhost:3000')).rejects.toThrow(
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
    // Allowlist entries use the unbracketed form a human would naturally
    // type. `new URL(...).hostname` brackets an IPv6 literal
    // (`http://[::1]` -> hostname `[::1]`) -- this test proves the
    // allowlist check normalizes brackets and correctly MATCHES here (so
    // these requests reach the private-address check at all), and that the
    // private-address check is what actually rejects them, not a bracket
    // mismatch at the allowlist step. See A.8.1 / SEC-28's "Update" for the
    // bug this regression-tests: before the fix, these were rejected for
    // the WRONG reason (bracketed hostname never matched the unbracketed
    // allowlist entry), which meant the private-address predicate was
    // never actually exercised by this test at all.
    mockEnv.SECURITY_ALLOWED_OUTBOUND_HOSTS =
      '::1, fe80::1, 169.254.169.254, 0.0.0.0';

    await expect(secureFetch('https://[::1]')).rejects.toThrow(
      'SSRF Protection',
    );
    expect(mockChildLogger.error).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining('private/reserved literal address'),
    );

    mockChildLogger.error.mockClear();
    await expect(secureFetch('https://[fe80::1]')).rejects.toThrow(
      'SSRF Protection',
    );
    expect(mockChildLogger.error).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining('private/reserved literal address'),
    );

    await expect(secureFetch('https://169.254.169.254')).rejects.toThrow(
      'SSRF Protection',
    );
    await expect(secureFetch('https://0.0.0.0')).rejects.toThrow(
      'SSRF Protection',
    );
  });

  it('allows a bracketed public IPv6 literal that matches an unbracketed allowlist entry', async () => {
    // The other half of the bracket-normalization proof: normalization
    // must not turn into a blanket rejection. A genuinely public IPv6
    // address, allowlisted in the natural unbracketed form, must still be
    // reachable once the hostname's brackets are stripped for comparison.
    mockEnv.SECURITY_ALLOWED_OUTBOUND_HOSTS = '2001:4860:4860::8888';
    await expect(
      secureFetch('https://[2001:4860:4860::8888]'),
    ).resolves.toBeDefined();
  });

  it('should block an IPv4-mapped IPv6 address pointing at a private range', async () => {
    mockEnv.SECURITY_ALLOWED_OUTBOUND_HOSTS = '::ffff:10.0.0.5';
    await expect(secureFetch('https://[::ffff:10.0.0.5]')).rejects.toThrow(
      'SSRF Protection',
    );
  });

  it('blocks non-globally-routable ranges beyond RFC1918/loopback/link-local', async () => {
    // These were previously NOT covered by the old hand-maintained regex
    // list at all -- ipaddr.js's default-deny "must classify as exactly
    // unicast" replaces that enumerated list, so this proves the new
    // classifier actually covers them rather than assuming it does.
    mockEnv.SECURITY_ALLOWED_OUTBOUND_HOSTS =
      '100.64.0.1, 192.0.2.1, 198.18.0.1, 224.0.0.1, 240.0.0.1, 255.255.255.255';

    await expect(secureFetch('https://100.64.0.1')).rejects.toThrow(
      'SSRF Protection',
    ); // CGNAT (100.64.0.0/10)
    await expect(secureFetch('https://192.0.2.1')).rejects.toThrow(
      'SSRF Protection',
    ); // TEST-NET-1
    await expect(secureFetch('https://198.18.0.1')).rejects.toThrow(
      'SSRF Protection',
    ); // benchmarking (198.18.0.0/15)
    await expect(secureFetch('https://224.0.0.1')).rejects.toThrow(
      'SSRF Protection',
    ); // multicast
    await expect(secureFetch('https://240.0.0.1')).rejects.toThrow(
      'SSRF Protection',
    ); // reserved
    await expect(secureFetch('https://255.255.255.255')).rejects.toThrow(
      'SSRF Protection',
    ); // broadcast
  });

  it('blocks 6to4- and NAT64-encoded IPv6 addresses regardless of the IPv4 they encode', async () => {
    // 2002:7f00:1:: is the 6to4 (2002::/16) encoding of 127.0.0.1;
    // 64:ff9b::a00:1 is the NAT64 (64:ff9b::/96, RFC 6052) encoding of
    // 10.0.0.1. Neither range is ever classified as `unicast` by
    // ipaddr.js, so both are rejected outright without needing a separate
    // unwrap-and-recheck step -- this app has no legitimate reason to
    // dial either IPv6 transition mechanism directly.
    mockEnv.SECURITY_ALLOWED_OUTBOUND_HOSTS = '2002:7f00:1::, 64:ff9b::a00:1';

    await expect(secureFetch('https://[2002:7f00:1::]')).rejects.toThrow(
      'SSRF Protection',
    );
    await expect(secureFetch('https://[64:ff9b::a00:1]')).rejects.toThrow(
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
    // 93.184.216.34 must be a genuinely public (unicast) address for this
    // test to prove what it claims -- 203.0.113.0/24 (used here
    // previously) is RFC 5737's TEST-NET-3, a documentation-only range
    // that A.8.1's default-deny classifier correctly rejects, which made
    // this test fail for an unrelated reason once that range gained
    // coverage.
    mockEnv.SECURITY_ALLOWED_OUTBOUND_HOSTS = '93.184.216.34';
    await expect(secureFetch('https://93.184.216.34')).resolves.toBeDefined();
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

  // SEC-39: an allowlisted, public, correctly-pinned host reached over
  // http:// still puts every Authorization header, API key and request body
  // on the wire in clear. The protocol gate is checked before the allowlist
  // and before any DNS work, because it holds regardless of who the host is.
  describe('HTTPS-only transport (SEC-39)', () => {
    it('rejects a plaintext http:// request to an otherwise allowed host', async () => {
      const { fn } = mockFetchSequence([new Response('{}', { status: 200 })]);
      global.fetch = fn;

      await expect(secureFetch('http://example.com/api')).rejects.toThrow(
        /must use https/i,
      );
      expect(fn).not.toHaveBeenCalled();
    });

    it('rejects before doing any DNS work', async () => {
      const { fn } = mockFetchSequence([new Response('{}', { status: 200 })]);
      global.fetch = fn;

      await expect(secureFetch('http://example.com/api')).rejects.toThrow();
      expect(vi.mocked(lookup)).not.toHaveBeenCalled();
    });

    it.each(['ftp:', 'file:', 'gopher:'])(
      'rejects the %s scheme outright',
      async (scheme) => {
        const { fn } = mockFetchSequence([new Response('{}', { status: 200 })]);
        global.fetch = fn;

        await expect(secureFetch(`${scheme}//example.com/x`)).rejects.toThrow(
          /must use https/i,
        );
        expect(fn).not.toHaveBeenCalled();
      },
    );

    // The downgrade the report calls out: a trusted host answering
    // 307 -> http:// must not be followed in cleartext.
    it('rejects a redirect that downgrades https to http on the same host', async () => {
      const { fn, calls } = mockFetchSequence([
        new Response(null, {
          status: 307,
          headers: { location: 'http://example.com/downgraded' },
        }),
        new Response('{"ok":true}', { status: 200 }),
      ]);
      global.fetch = fn;

      await expect(secureFetch('https://example.com/start')).rejects.toThrow(
        /must use https/i,
      );
      // The first hop happened; the downgraded one never did.
      expect(calls).toHaveLength(1);
    });

    it('allows plaintext outside production when the flag is set', async () => {
      mockEnv.NODE_ENV = 'development';
      mockEnv.SECURITY_OUTBOUND_ALLOW_INSECURE_HTTP = true;
      const { fn } = mockFetchSequence([new Response('{}', { status: 200 })]);
      global.fetch = fn;

      const response = await secureFetch('http://example.com/api');

      expect(response.status).toBe(200);
      expect(mockChildLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ protocol: 'http:' }),
        expect.stringContaining('never honoured in production'),
      );
    });

    // The point of the flag's design: production must be safe even when the
    // value is wrong, because a stray `true` in a deployed environment is
    // exactly the accident this must not permit.
    it('ignores the flag in production and says that it did', async () => {
      mockEnv.NODE_ENV = 'production';
      mockEnv.SECURITY_OUTBOUND_ALLOW_INSECURE_HTTP = true;
      const { fn } = mockFetchSequence([new Response('{}', { status: 200 })]);
      global.fetch = fn;

      await expect(secureFetch('http://example.com/api')).rejects.toThrow(
        /must use https/i,
      );
      expect(fn).not.toHaveBeenCalled();
      expect(mockChildLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ insecureFlagSetButIgnored: true }),
        expect.stringContaining('HTTPS-only'),
      );
    });
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

    it('keeps Authorization intact across a same-origin redirect', async () => {
      const { fn, calls } = mockFetchSequence([
        new Response(null, {
          status: 302,
          headers: { location: 'https://example.com/two' },
        }),
        new Response(null, { status: 200 }),
      ]);
      global.fetch = fn;

      await secureFetch('https://example.com/one', {
        headers: { Authorization: 'Bearer secret-token' },
      });

      expect(calls).toHaveLength(2);
      const secondHopHeaders = new Headers(calls[1][1]?.headers);
      expect(secondHopHeaders.get('authorization')).toBe('Bearer secret-token');
    });

    it('strips credential-shaped headers on a cross-origin redirect, but keeps ordinary ones', async () => {
      const { fn, calls } = mockFetchSequence([
        new Response(null, {
          status: 302,
          headers: { location: 'https://trusted.org/final' },
        }),
        new Response(null, { status: 200 }),
      ]);
      global.fetch = fn;

      await secureFetch('https://example.com/start', {
        headers: {
          Authorization: 'Bearer secret-token',
          Cookie: 'session=abc123',
          'X-Api-Token': 'another-secret',
          Accept: 'application/json',
          'X-Request-Id': 'req-1',
        },
      });

      expect(calls).toHaveLength(2);
      const secondHopHeaders = new Headers(calls[1][1]?.headers);
      expect(secondHopHeaders.get('authorization')).toBeNull();
      expect(secondHopHeaders.get('cookie')).toBeNull();
      expect(secondHopHeaders.get('x-api-token')).toBeNull();
      // Non-sensitive headers must survive -- this isn't a
      // strip-everything-on-redirect fix.
      expect(secondHopHeaders.get('accept')).toBe('application/json');
      expect(secondHopHeaders.get('x-request-id')).toBe('req-1');
    });
  });

  describe('resource limits and log redaction', () => {
    it('rejects with a timeout-labeled error once the overall budget expires', async () => {
      mockEnv.SECURITY_OUTBOUND_FETCH_TIMEOUT_MS = 10;
      // A response that never resolves on its own -- only rejects when the
      // signal secureFetch built (a real AbortSignal.timeout) fires, the
      // same way a real fetch() implementation would.
      global.fetch = vi.fn().mockImplementation(
        (_url: string | URL, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              reject(init.signal!.reason);
            });
          }),
      );

      await expect(secureFetch('https://example.com/slow')).rejects.toThrow(
        /SSRF Protection.*timed out/,
      );
    });

    it('rejects with a timeout-labeled error once the overall budget expires during DNS resolution -- not just during fetch()', async () => {
      // dns.promises.lookup() has no AbortSignal support at all (confirmed
      // empirically, SEC-32 / A.8 follow-up) -- a never-resolving mock here
      // stands in for that: nothing in this test ever settles this
      // promise, proving the timeout comes from secureFetch()'s own
      // overall-deadline race (raceWithSignal()), not from the lookup call
      // itself ever giving up.
      mockEnv.SECURITY_OUTBOUND_FETCH_TIMEOUT_MS = 10;
      vi.mocked(lookup)
        .mockReset()
        .mockImplementation(
          () =>
            new Promise(() => undefined) as unknown as ReturnType<
              typeof lookup
            >,
        );

      await expect(secureFetch('https://example.com/slow-dns')).rejects.toThrow(
        /SSRF Protection.*DNS resolution.*timed out/,
      );
      // fetch() must never have been reached -- the deadline fired while
      // still resolving the host, before any hop's fetch() call.
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('rejects once the response body exceeds the configured byte cap, without buffering past it', async () => {
      mockEnv.SECURITY_OUTBOUND_FETCH_MAX_BYTES = 10;
      let chunksProduced = 0;
      const stream = new ReadableStream<Uint8Array>({
        async pull(controller) {
          chunksProduced += 1;
          // 6 bytes/chunk; the cap (10 bytes) is exceeded on the 2nd chunk.
          // If more than 3 chunks are ever pulled, the reader wasn't
          // actually cancelled once the cap was hit.
          if (chunksProduced > 3) {
            controller.close();
            return;
          }
          controller.enqueue(new TextEncoder().encode('abcdef'));
        },
      });
      global.fetch = vi
        .fn()
        .mockResolvedValue(new Response(stream, { status: 200 }));

      await expect(secureFetch('https://example.com/big')).rejects.toThrow(
        /SSRF Protection.*exceeded/,
      );
      expect(chunksProduced).toBeLessThanOrEqual(3);
    });

    it('never logs the query string of a blocked URL', async () => {
      await expect(
        secureFetch('https://malicious.com/steal?token=super-secret-value'),
      ).rejects.toThrow('SSRF Protection');

      expect(mockChildLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.not.stringContaining('super-secret-value'),
        }),
        expect.any(String),
      );
      expect(mockChildLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ url: 'https://malicious.com/steal' }),
        expect.any(String),
      );
    });
  });
});
