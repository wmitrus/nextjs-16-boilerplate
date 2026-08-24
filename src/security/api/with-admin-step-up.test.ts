/** @vitest-environment node */
import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const envMock = vi.hoisted(() => ({
  APP_SECURITY_MASTER_KEY: 'step-up-guard-test-master-key-not-a-real-secret' as
    | string
    | undefined,
  APP_SECURITY_MASTER_KEY_PREVIOUS: undefined as string | undefined,
  ADMIN_STEP_UP_MODE: 'required' as 'required' | 'bypass-local-only',
  NODE_ENV: 'test' as string,
  VERCEL_ENV: undefined as string | undefined,
}));

const mocks = vi.hoisted(() => ({
  identity: {
    get: vi.fn(),
  },
  mfa: {
    getStatus: vi.fn(),
    verifyChallenge: vi.fn(),
  },
  recordAdminAuditEvent: vi.fn().mockResolvedValue(undefined),
  registry: new Map<symbol, unknown>(),
}));

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

vi.mock('@/security/actions/record-admin-audit-event', () => ({
  recordAdminAuditEvent: mocks.recordAdminAuditEvent,
}));

import { AUTH } from '@/core/contracts';

import { withAdminStepUp } from './with-admin-step-up';

import { STEP_UP_COOKIE_NAME } from '@/security/core/step-up/cookie';
import { STEP_UP_TTL_SECONDS } from '@/security/core/step-up/policy';
import { mintStepUpProof } from '@/security/core/step-up/proof';
import { makeAllowedProvisioningAccess } from '@/testing/factories/provisioning';
import '@/testing/infrastructure/logger';

const ACCESS = makeAllowedProvisioningAccess();
const USER_ID = ACCESS.user.id;
const SESSION_ID = 'sess_current';
const PATH = '/api/admin/users/abc';

const handler = vi.fn(() => NextResponse.json({ ok: true }, { status: 200 }));
const context = { params: Promise.resolve({}) };

function requestWithProof(proof?: string): NextRequest {
  const headers = new Headers();
  if (proof) headers.set('cookie', `${STEP_UP_COOKIE_NAME}=${proof}`);
  return new NextRequest(`http://localhost:3000${PATH}`, {
    method: 'PATCH',
    headers,
  });
}

async function run(proof?: string) {
  return withAdminStepUp(handler)(requestWithProof(proof), context, ACCESS);
}

async function validProof(
  overrides: Partial<Parameters<typeof mintStepUpProof>[0]> = {},
): Promise<string> {
  const { token } = await mintStepUpProof({
    userId: USER_ID,
    logicalSessionId: SESSION_ID,
    methods: ['pwd', 'otp'],
    ...overrides,
  });
  return token;
}

beforeEach(() => {
  vi.clearAllMocks();
  envMock.APP_SECURITY_MASTER_KEY =
    'step-up-guard-test-master-key-not-a-real-secret';
  envMock.ADMIN_STEP_UP_MODE = 'required';
  envMock.NODE_ENV = 'test';
  envMock.VERCEL_ENV = undefined;

  mocks.identity.get.mockResolvedValue({
    userId: 'external_1',
    logicalSessionId: SESSION_ID,
  });
  mocks.mfa.getStatus.mockResolvedValue({
    enrolled: true,
    enrollmentSurface: 'application',
    enrollmentUrl: '/account/security/mfa',
  });

  mocks.registry.set(AUTH.IDENTITY_SOURCE, mocks.identity);
  mocks.registry.set(AUTH.MFA_SERVICE, mocks.mfa);
});

describe('withAdminStepUp', () => {
  it('runs the handler when a fresh proof matches the caller and session', async () => {
    const response = await run(await validProof());

    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledOnce();
  });

  it('refuses a mutation with no proof at all', async () => {
    const response = await run();

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      code: 'STEP_UP_REQUIRED',
    });
    expect(handler).not.toHaveBeenCalled();
    expect(mocks.recordAdminAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'admin.step_up.denied',
        outcome: 'denied',
        targetId: PATH,
        metadata: { reason: 'absent' },
      }),
    );
  });

  it('refuses a proof minted for another principal', async () => {
    const foreign = await validProof({ userId: 'someone-else' });

    const response = await run(foreign);

    expect(response.status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
    expect(mocks.recordAdminAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: { reason: 'subject_mismatch' } }),
    );
  });

  it('refuses a proof earned in a previous session', async () => {
    // Sign out, sign back in: the provider issues a new logical session id,
    // and last session's proof stops meaning anything.
    const previous = await validProof({ logicalSessionId: 'sess_previous' });

    const response = await run(previous);

    expect(response.status).toBe(403);
    expect(mocks.recordAdminAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: { reason: 'session_mismatch' } }),
    );
  });

  it('refuses a proof older than the freshness window', async () => {
    const stale = await validProof({
      nowSeconds: Math.floor(Date.now() / 1000) - STEP_UP_TTL_SECONDS - 1,
    });

    const response = await run(stale);

    expect(response.status).toBe(403);
    expect(mocks.recordAdminAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: { reason: 'expired' } }),
    );
  });

  it('refuses a tampered proof', async () => {
    const token = await validProof();
    const parts = token.split('.');
    const tampered = [
      parts[0],
      parts[1],
      parts[2],
      `${parts[3]![0] === 'A' ? 'B' : 'A'}${parts[3]!.slice(1)}`,
    ].join('.');

    const response = await run(tampered);

    expect(response.status).toBe(403);
    expect(mocks.recordAdminAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: { reason: 'bad_signature' } }),
    );
  });

  it('demands enrollment before it demands a proof', async () => {
    // Different problem, different remedy: an un-enrolled admin sent into a
    // challenge cannot pass it, and would have no idea why.
    mocks.mfa.getStatus.mockResolvedValue({
      enrolled: false,
      enrollmentSurface: 'application',
      enrollmentUrl: '/account/security/mfa',
    });

    const response = await run(await validProof());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      code: 'MFA_ENROLLMENT_REQUIRED',
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it('fails closed when the provider exposes no logical session id', async () => {
    // Falling back to the user id would make one proof valid across every
    // session that user ever opens.
    mocks.identity.get.mockResolvedValue({ userId: 'external_1' });

    const response = await run(await validProof());

    expect(response.status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
    expect(mocks.recordAdminAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { reason: 'missing_session_reference' },
      }),
    );
  });

  it('refuses the mutation when key material is missing', async () => {
    // Not a bypass: no proof can be minted or verified, so the operation is
    // refused with an operator-readable reason.
    envMock.APP_SECURITY_MASTER_KEY = undefined;

    const response = await run();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: 'STEP_UP_UNAVAILABLE',
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it('honours the local-only bypass on a developer machine', async () => {
    envMock.ADMIN_STEP_UP_MODE = 'bypass-local-only';
    envMock.APP_SECURITY_MASTER_KEY = undefined;

    const response = await run();

    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledOnce();
  });

  const deployedEnvironments: Array<[string, string, string | undefined]> = [
    ['a production build', 'production', undefined],
    ['a Vercel preview deployment', 'test', 'preview'],
  ];

  it.each(deployedEnvironments)(
    'ignores the bypass on %s',
    async (_label, nodeEnv, vercelEnv) => {
      envMock.ADMIN_STEP_UP_MODE = 'bypass-local-only';
      envMock.NODE_ENV = nodeEnv;
      envMock.VERCEL_ENV = vercelEnv;

      const response = await run();

      expect(response.status).toBe(403);
      expect(handler).not.toHaveBeenCalled();
    },
  );

  it('does not consult authorization level at all', async () => {
    // Step-up is an authentication-assurance boundary. A platform admin and
    // a tenant admin pass the same challenge; nothing here asks which one
    // the caller is.
    const response = await run(await validProof());

    expect(response.status).toBe(200);
    expect(mocks.registry.get(AUTH.MFA_SERVICE)).toBe(mocks.mfa);
    expect(mocks.mfa.getStatus).toHaveBeenCalledWith({
      userId: USER_ID,
      externalUserId: 'external_1',
    });
  });
});
