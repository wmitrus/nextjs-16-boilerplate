import { describe, expect, it } from 'vitest';

import { canonicalizeIp, createClientIpResolver } from './client-ip';

function h(entries: Record<string, string>): Headers {
  return new Headers(entries);
}

describe('canonicalizeIp', () => {
  it('accepts plain IPv4 and IPv6', () => {
    expect(canonicalizeIp('203.0.113.7')).toBe('203.0.113.7');
    expect(canonicalizeIp('2001:db8::1')).toBe('2001:db8::1');
  });

  it('collapses the spellings of one address to a single key', () => {
    // Without this, `::ffff:192.0.2.1` and `192.0.2.1` would be two
    // rate-limit buckets for one client -- a bypass costing nothing but a
    // different way of writing the address.
    expect(canonicalizeIp('::ffff:192.0.2.1')).toBe('192.0.2.1');
    expect(canonicalizeIp('::FFFF:192.0.2.1')).toBe('192.0.2.1');
    expect(canonicalizeIp('2001:0DB8:0000:0000:0000:0000:0000:0001')).toBe(
      '2001:db8::1',
    );
  });

  it('unwraps a bracketed IPv6 literal', () => {
    expect(canonicalizeIp('[2001:db8::1]')).toBe('2001:db8::1');
  });

  it('rejects anything that is not an address', () => {
    for (const bad of ['', '   ', 'not-an-ip', '999.1.1.1', 'unknown']) {
      expect(canonicalizeIp(bad)).toBeNull();
    }
  });

  it('rejects short-form IPv4, which ipaddr.js would otherwise expand', () => {
    // `ipaddr.isValid('1.2.3')` is true and parses to `1.2.0.3`. No proxy
    // emits that notation, so accepting it means accepting input no
    // legitimate upstream produces.
    expect(canonicalizeIp('1.2.3')).toBeNull();
    expect(canonicalizeIp('1')).toBeNull();
    expect(canonicalizeIp('0x7f.1')).toBeNull();
  });

  it('rejects an address with a port', () => {
    expect(canonicalizeIp('203.0.113.7:443')).toBeNull();
  });
});

describe('createClientIpResolver — none', () => {
  const resolve = createClientIpResolver({ proxy: 'none' });

  it('trusts nothing, however plausible the headers look', () => {
    expect(
      resolve(
        h({
          'x-forwarded-for': '203.0.113.7',
          'x-real-ip': '203.0.113.7',
          'cf-connecting-ip': '203.0.113.7',
        }),
      ),
    ).toEqual({ kind: 'untrusted', reason: 'no-trust-model' });
  });
});

describe('createClientIpResolver — cloudflare', () => {
  const resolve = createClientIpResolver({ proxy: 'cloudflare' });

  it('uses cf-connecting-ip', () => {
    expect(resolve(h({ 'cf-connecting-ip': '203.0.113.7' }))).toEqual({
      kind: 'trusted',
      ip: '203.0.113.7',
    });
  });

  it('ignores x-forwarded-for entirely', () => {
    // The bug this whole case is about, in its sharpest form: Cloudflare
    // appends to whatever the client sent, so XFF's leftmost entry is
    // attacker-supplied. The old resolver preferred it over cf-connecting-ip.
    expect(
      resolve(
        h({
          'x-forwarded-for': '1.2.3.4',
          'cf-connecting-ip': '203.0.113.7',
        }),
      ),
    ).toEqual({ kind: 'trusted', ip: '203.0.113.7' });
  });

  it('is untrusted when Cloudflare is declared but its header is absent', () => {
    expect(resolve(h({ 'x-forwarded-for': '1.2.3.4' }))).toEqual({
      kind: 'untrusted',
      reason: 'header-missing',
    });
  });

  it('is untrusted when the header is malformed', () => {
    expect(resolve(h({ 'cf-connecting-ip': 'nonsense' }))).toEqual({
      kind: 'untrusted',
      reason: 'header-malformed',
    });
  });
});

describe('createClientIpResolver — vercel', () => {
  const resolve = createClientIpResolver({ proxy: 'vercel' });

  it('prefers the Vercel-set header', () => {
    expect(
      resolve(
        h({
          'x-vercel-forwarded-for': '203.0.113.7',
          'x-real-ip': '198.51.100.1',
        }),
      ),
    ).toEqual({ kind: 'trusted', ip: '203.0.113.7' });
  });

  it('falls back to x-real-ip', () => {
    expect(resolve(h({ 'x-real-ip': '198.51.100.1' }))).toEqual({
      kind: 'trusted',
      ip: '198.51.100.1',
    });
  });

  it('does not consult x-forwarded-for', () => {
    expect(resolve(h({ 'x-forwarded-for': '1.2.3.4' }))).toEqual({
      kind: 'untrusted',
      reason: 'header-missing',
    });
  });
});

describe('createClientIpResolver — trusted-proxy', () => {
  const resolve = createClientIpResolver({
    proxy: 'trusted-proxy',
    trustedProxyCidrs: ['10.0.0.0/8', '172.16.0.0/12'],
  });

  it('returns the first hop that is not one of our proxies', () => {
    expect(
      resolve(h({ 'x-forwarded-for': '203.0.113.50, 10.0.0.20, 10.0.0.30' })),
    ).toEqual({ kind: 'trusted', ip: '203.0.113.50' });
  });

  it('is not fooled by a client-prepended address', () => {
    // The reason the walk runs right to left. Taking the leftmost entry here
    // would hand the attacker 1.2.3.4 -- any address they like.
    expect(
      resolve(
        h({
          'x-forwarded-for': '1.2.3.4, 203.0.113.50, 10.0.0.20, 10.0.0.30',
        }),
      ),
    ).toEqual({ kind: 'trusted', ip: '203.0.113.50' });
  });

  it('is untrusted when every hop is one of our own proxies', () => {
    // The header never recorded a client, so there is no client to report.
    expect(resolve(h({ 'x-forwarded-for': '10.0.0.20, 172.16.0.5' }))).toEqual({
      kind: 'untrusted',
      reason: 'no-untrusted-hop',
    });
  });

  it('rejects the whole header when any hop is malformed', () => {
    // Skipping junk would let an attacker insert it to shift which entry the
    // walk lands on.
    expect(
      resolve(h({ 'x-forwarded-for': '203.0.113.50, junk, 10.0.0.30' })),
    ).toEqual({ kind: 'untrusted', reason: 'header-malformed' });
  });

  it('canonicalises the address it returns', () => {
    expect(
      resolve(h({ 'x-forwarded-for': '::ffff:203.0.113.50, 10.0.0.30' })),
    ).toEqual({ kind: 'trusted', ip: '203.0.113.50' });
  });

  it('refuses an over-long header instead of parsing it', () => {
    const long = Array.from({ length: 200 }, () => '10.0.0.1').join(', ');
    expect(resolve(h({ 'x-forwarded-for': long }))).toEqual({
      kind: 'untrusted',
      reason: 'header-too-long',
    });
  });

  it('refuses a header with too many hops', () => {
    // Short enough to pass the length cap, long enough to exceed the hop cap.
    const many = Array.from({ length: 40 }, () => '1.2.3.4').join(',');
    expect(many.length).toBeLessThanOrEqual(1024);
    expect(resolve(h({ 'x-forwarded-for': many }))).toEqual({
      kind: 'untrusted',
      reason: 'too-many-hops',
    });
  });

  it('is untrusted when the header is absent', () => {
    expect(resolve(h({}))).toEqual({
      kind: 'untrusted',
      reason: 'header-missing',
    });
  });

  it('refuses to build without any CIDRs', () => {
    expect(() =>
      createClientIpResolver({ proxy: 'trusted-proxy', trustedProxyCidrs: [] }),
    ).toThrow(/requires TRUSTED_PROXY_CIDRS/);
  });

  it('refuses to build with a malformed CIDR, at construction', () => {
    // At build time, not per request: a typo that silently matched nothing
    // would look like a working config while trusting no proxy at all.
    expect(() =>
      createClientIpResolver({
        proxy: 'trusted-proxy',
        trustedProxyCidrs: ['10.0.0.0/8', 'not-a-cidr'],
      }),
    ).toThrow(/invalid CIDR/);
  });
});
