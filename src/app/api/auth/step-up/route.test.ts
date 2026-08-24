/** @vitest-environment node */
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const envMock = vi.hoisted(() => ({
  APP_SECURITY_MASTER_KEY: 'step-up-route-test-master-key-not-a-real-secret' as
    | string
    | undefined,
  APP_SECURITY_MASTER_KEY_PREVIOUS: undefined as string | undefined,
  ADMIN_STEP_UP_MODE: 'required' as 'required' | 'bypass-local-only',
  NODE_ENV: 'test' as string,
  VERCEL_ENV: undefined as string | undefined,
}));

const mocks = vi.hoisted(() => ({
  connection: vi.fn().mockResolvedValue(undefined),
  resolveAccess: vi.fn(),
  checkStrictRateLimit: vi.fn(),
  recordAdminAuditEvent: vi.fn().mockResolvedValue(undefined),
  identity: { get: vi.fn() },
  mfa: { getStatus: vi.fn(), verifyChallenge: vi.fn() },
  registry: new Map<symbol, unknown>(),
}));

vi.mock('next/server', async () => {
  const actual = await vi.importActual('next/server');
  return { ...actual, connection: mocks.connection };
});

vi.mock('@/core/env', async (importOriginal) => {
  const actual = (await importOriginal()) as { env: Record<string, unknown> };
  return {
    ...actual,
    get env() {
      return { ...actual.env, ...envMock };
    },
  };
});

vi.mock('@/core/runtime/bootstrap', () => ({
  getAppContainer: () => ({
    resolve: (token: symbol) => mocks.registry.get(token),
  }),
}));

vi.mock('@/security/core/node-provisioning-runtime', () => ({
  resolveNodeProvisioningAccess: mocks.resolveAccess,
}));

vi.mock('@/security/api/strict-rate-limit', () => ({
  checkStrictRateLimit: mocks.checkStrictRateLimit,
}));

vi.mock('@/security/actions/record-admin-audit-event', () => ({
  recordAdminAuditEvent: mocks.recordAdminAuditEvent,
}));

import { AUTH } from '@/core/contracts';

import { GET, POST } from './route';

import { STEP_UP_COOKIE_NAME } from '@/security/core/step-up/cookie';
import { mintStepUpProof } from '@/security/core/step-up/proof';
import { makeAllowedProvisioningAccess } from '@/testing/factories/provisioning';
import '@/testing/infrastructure/logger';

const ACCESS = makeAllowedProvisioningAccess();
const SESSION_ID = 'sess_current';
const context = { params: Promise.resolve({}) };

function post(body: unknown, cookie?: string): NextRequest {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (cookie) headers.set('cookie', cookie);
  return new NextRequest('http://localhost:3000/api/auth/step-up', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

function get(cookie?: string): NextRequest {
  const headers = new Headers();
  if (cookie) headers.set('cookie', cookie);
  return new NextRequest('http://localhost:3000/api/auth/step-up', { headers });
}

beforeEach(() => {
  vi.clearAllMocks();
  envMock.APP_SECURITY_MASTER_KEY =
    'step-up-route-test-master-key-not-a-real-secret';
  envMock.ADMIN_STEP_UP_MODE = 'required';

  mocks.resolveAccess.mockResolvedValue(ACCESS);
  mocks.checkStrictRateLimit.mockResolvedValue({ success: true });
  mocks.identity.get.mockResolvedValue({
    userId: 'external_1',
    logicalSessionId: SESSION_ID,
  });
  mocks.mfa.getStatus.mockResolvedValue({
    enrolled: true,
    enrollmentSurface: 'application',
    enrollmentUrl: '/account/security/mfa',
  });
  mocks.mfa.verifyChallenge.mockResolvedValue({ ok: true, factor: 'otp' });

  mocks.registry.set(AUTH.IDENTITY_SOURCE, mocks.identity);
  mocks.registry.set(AUTH.MFA_SERVICE, mocks.mfa);
});

describe('POST /api/auth/step-up', () => {
  it('issues a session-bound proof cookie for a verified code', async () => {
    const response = await POST(post({ code: '123456' }), context);

    expect(response.status).toBe(200);
    const cookie = response.cookies.get(STEP_UP_COOKIE_NAME);
    expect(cookie?.value).toMatch(/^v1\./);
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe('strict');
    expect(cookie?.maxAge).toBe(15 * 60);

    expect(mocks.recordAdminAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'auth',
        action: 'mfa.challenge.verified',
        outcome: 'success',
        metadata: { factor: 'otp' },
      }),
    );
  });

  it('records which factor satisfied the challenge in the proof', async () => {
    mocks.mfa.verifyChallenge.mockResolvedValue({
      ok: true,
      factor: 'recovery',
    });

    const response = await POST(
      post({ code: 'ABCDEF-GHJKMNPQRSTVWXYZ2' }),
      context,
    );
    const token = response.cookies.get(STEP_UP_COOKIE_NAME)!.value;
    const claims = JSON.parse(
      Buffer.from(token.split('.')[2]!, 'base64url').toString('utf8'),
    ) as { amr: string[]; acr: string; sid: string };

    // `pwd` is always present: the base session was established with a first
    // factor, which is what makes this assurance level multi-factor.
    expect(claims.amr).toEqual(['pwd', 'recovery']);
    expect(claims.acr).toBe('mfa');
    expect(claims.sid).toBe(SESSION_ID);
  });

  it('refuses a wrong code without issuing a cookie', async () => {
    mocks.mfa.verifyChallenge.mockResolvedValue({
      ok: false,
      reason: 'invalid_code',
    });

    const response = await POST(post({ code: '000000' }), context);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      code: 'MFA_CODE_INVALID',
    });
    expect(response.cookies.get(STEP_UP_COOKIE_NAME)).toBeUndefined();
    expect(mocks.recordAdminAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'mfa.challenge.failed',
        metadata: { reason: 'invalid_code' },
      }),
    );
  });

  it('gives a replayed code the same answer as a wrong one', async () => {
    // The distinction belongs in the audit trail, not in the response: an
    // attacker must not learn that the code they replayed was ever valid.
    mocks.mfa.verifyChallenge.mockResolvedValue({
      ok: false,
      reason: 'replayed',
    });

    const response = await POST(post({ code: '123456' }), context);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      code: 'MFA_CODE_INVALID',
    });
    expect(mocks.recordAdminAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: { reason: 'replayed' } }),
    );
  });

  it('tells an un-enrolled caller to enroll instead of retrying', async () => {
    mocks.mfa.verifyChallenge.mockResolvedValue({
      ok: false,
      reason: 'not_enrolled',
    });

    const response = await POST(post({ code: '123456' }), context);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      code: 'MFA_ENROLLMENT_REQUIRED',
    });
  });

  it('rate limits on the actor, before any code is checked', async () => {
    mocks.checkStrictRateLimit.mockResolvedValue({ success: false });

    const response = await POST(post({ code: '123456' }), context);

    expect(response.status).toBe(429);
    expect(mocks.checkStrictRateLimit).toHaveBeenCalledWith(
      `step-up:${ACCESS.user.id}`,
      expect.objectContaining({ path: '/api/auth/step-up' }),
    );
    expect(mocks.mfa.verifyChallenge).not.toHaveBeenCalled();
  });

  it('refuses to mint anything without key material', async () => {
    envMock.APP_SECURITY_MASTER_KEY = undefined;

    const response = await POST(post({ code: '123456' }), context);

    expect(response.status).toBe(503);
    expect(mocks.mfa.verifyChallenge).not.toHaveBeenCalled();
  });

  it('refuses to mint a proof it cannot bind to a session', async () => {
    mocks.identity.get.mockResolvedValue({ userId: 'external_1' });

    const response = await POST(post({ code: '123456' }), context);

    expect(response.status).toBe(503);
    expect(mocks.mfa.verifyChallenge).not.toHaveBeenCalled();
  });

  it.each([[{}], [{ code: '123' }], [{ code: 'x'.repeat(65) }]])(
    'rejects the malformed body %j',
    async (body) => {
      const response = await POST(post(body), context);

      expect(response.status).toBe(400);
      expect(mocks.mfa.verifyChallenge).not.toHaveBeenCalled();
    },
  );
});

describe('GET /api/auth/step-up', () => {
  it('reports enrollment state and no satisfied window without a proof', async () => {
    const response = await GET(get(), context);

    await expect(response.json()).resolves.toMatchObject({
      status: 'ok',
      data: {
        enforcement: 'required',
        enrolled: true,
        enrollmentUrl: '/account/security/mfa',
        satisfiedUntil: null,
        freshnessSeconds: 900,
      },
    });
  });

  it('reports the window a valid proof is good for', async () => {
    const { token, claims } = await mintStepUpProof({
      userId: ACCESS.user.id,
      logicalSessionId: SESSION_ID,
      methods: ['pwd', 'otp'],
    });

    const response = await GET(get(`${STEP_UP_COOKIE_NAME}=${token}`), context);
    const body = (await response.json()) as {
      data: { satisfiedUntil: string | null };
    };

    expect(body.data.satisfiedUntil).toBe(
      new Date(claims.exp * 1000).toISOString(),
    );
  });

  it('ignores a proof from another session', async () => {
    const { token } = await mintStepUpProof({
      userId: ACCESS.user.id,
      logicalSessionId: 'sess_previous',
      methods: ['pwd', 'otp'],
    });

    const response = await GET(get(`${STEP_UP_COOKIE_NAME}=${token}`), context);
    const body = (await response.json()) as {
      data: { satisfiedUntil: string | null };
    };

    expect(body.data.satisfiedUntil).toBeNull();
  });

  it('reports a local bypass honestly rather than as "satisfied"', async () => {
    envMock.ADMIN_STEP_UP_MODE = 'bypass-local-only';

    const response = await GET(get(), context);
    const body = (await response.json()) as {
      data: { enforcement: string; satisfiedUntil: string | null };
    };

    expect(body.data.enforcement).toBe('bypassed');
    expect(body.data.satisfiedUntil).toBeNull();
  });
});
