import { beforeEach, describe, expect, it } from 'vitest';

import type { ClientIp } from '@/shared/lib/network/client-ip';

import {
  auditIpForClient,
  rateLimitKeyForClient,
  UNTRUSTED_CLIENT_BUCKET,
} from './get-ip';

const trusted: ClientIp = { kind: 'trusted', ip: '203.0.113.7' };
const untrusted: ClientIp = { kind: 'untrusted', reason: 'no-trust-model' };

describe('rateLimitKeyForClient', () => {
  it('keys a trusted client on its canonical address', () => {
    expect(rateLimitKeyForClient('login-ip', trusted)).toBe(
      'login-ip:203.0.113.7',
    );
  });

  it('puts every unidentifiable client in one stable bucket', () => {
    // Stable, not per-request. A fresh key each time would mean no rate limit
    // at all for these clients -- silently undoing SEC-42 for exactly the
    // requests whose origin cannot be verified.
    const a = rateLimitKeyForClient('login-ip', untrusted);
    const b = rateLimitKeyForClient('login-ip', {
      kind: 'untrusted',
      reason: 'header-malformed',
    });

    expect(a).toBe(b);
    expect(a).toContain(UNTRUSTED_CLIENT_BUCKET);
  });

  it('keeps the untrusted bucket separate per endpoint', () => {
    // Otherwise one endpoint's unidentifiable traffic would exhaust the
    // allowance of every other endpoint.
    expect(rateLimitKeyForClient('login-ip', untrusted)).not.toBe(
      rateLimitKeyForClient('signup', untrusted),
    );
  });

  it('never produces a key that looks like a real address for an unknown client', () => {
    // The specific regression this case exists to prevent: the old resolver
    // returned '127.0.0.1', so unknown clients were indistinguishable from
    // genuine loopback traffic in both keys and logs.
    expect(rateLimitKeyForClient('login-ip', untrusted)).not.toContain(
      '127.0.0.1',
    );
  });
});

describe('auditIpForClient', () => {
  it('records a trusted address', () => {
    expect(auditIpForClient(trusted)).toBe('203.0.113.7');
  });

  it('records null rather than a fabricated address', () => {
    expect(auditIpForClient(untrusted)).toBeNull();
  });
});

describe('getClientIp — env-driven trust model', () => {
  beforeEach(async () => {
    const { resetClientIpResolverForTests } = await import('./get-ip');
    const { resetEnvMocks } = await import('@/testing/infrastructure/env');
    resetEnvMocks();
    resetClientIpResolverForTests();
  });

  it('trusts nothing when no trust model is declared', async () => {
    const { mockEnv } = await import('@/testing/infrastructure/env');
    mockEnv.DEPLOYMENT_PROXY = undefined;
    mockEnv.NODE_ENV = 'test';

    const { getClientIp, resetClientIpResolverForTests } =
      await import('./get-ip');
    resetClientIpResolverForTests();

    await expect(
      getClientIp(new Headers({ 'x-forwarded-for': '203.0.113.7' })),
    ).resolves.toEqual({ kind: 'untrusted', reason: 'no-trust-model' });
  });

  it('honours a declared cloudflare trust model', async () => {
    const { mockEnv } = await import('@/testing/infrastructure/env');
    mockEnv.DEPLOYMENT_PROXY = 'cloudflare';

    const { getClientIp, resetClientIpResolverForTests } =
      await import('./get-ip');
    resetClientIpResolverForTests();

    await expect(
      getClientIp(
        new Headers({
          'x-forwarded-for': '1.2.3.4',
          'cf-connecting-ip': '203.0.113.7',
        }),
      ),
    ).resolves.toEqual({ kind: 'trusted', ip: '203.0.113.7' });
  });
});
