/** @vitest-environment node */
import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';

const resolveNodeProvisioningAccessMock = vi.hoisted(() => vi.fn());

vi.mock('@/core/runtime/bootstrap', () => ({
  getAppContainer: vi.fn(() => ({ mocked: true })),
}));

vi.mock('@/security/core/node-provisioning-runtime', () => ({
  resolveNodeProvisioningAccess: resolveNodeProvisioningAccessMock,
}));

vi.mock('@/core/env', async (importOriginal) => {
  const actual = (await importOriginal()) as { env: Record<string, unknown> };

  return {
    ...actual,
    env: {
      ...actual.env,
      TENANCY_MODE: 'single',
      TENANT_CONTEXT_SOURCE: undefined,
    },
  };
});

import { GET } from '@/app/api/me/provisioning-status/route';

describe('/api/me/provisioning-status route integration', () => {
  const context = { params: Promise.resolve({}) };

  it('returns controlled 409 when bootstrap is required', async () => {
    resolveNodeProvisioningAccessMock.mockResolvedValue({
      status: 'BOOTSTRAP_REQUIRED',
      code: 'BOOTSTRAP_REQUIRED',
      message: 'Bootstrap required',
    });

    const response = await GET(
      new NextRequest('http://localhost/api/me/provisioning-status'),
      context,
    );

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.code).toBe('BOOTSTRAP_REQUIRED');
    expect(body.data).toBeUndefined();
  });

  it('returns internal provisioning snapshot for allowed access', async () => {
    resolveNodeProvisioningAccessMock.mockResolvedValue({
      status: 'ALLOWED',
      identity: { id: 'u-1' },
      tenant: { tenantId: 't-1', userId: 'u-1' },
      user: { id: 'u-1', onboardingComplete: true },
    });

    const response = await GET(
      new NextRequest('http://localhost/api/me/provisioning-status'),
      context,
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('ok');
    expect(body.data.internalUserId).toBe('u-1');
    expect(body.data.internalTenantId).toBe('t-1');
    expect(body.data.onboardingComplete).toBe(true);
    expect(body.data.tenancyMode).toBe('single');
  });
});
