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

import { GET } from '@/app/api/users/route';

describe('/api/users node provisioning guard integration', () => {
  const context = { params: Promise.resolve({}) };

  it('returns 401 when user is unauthenticated', async () => {
    resolveNodeProvisioningAccessMock.mockResolvedValue({
      status: 'UNAUTHENTICATED',
      code: 'UNAUTHENTICATED',
      message: 'Authentication required',
    });

    const response = await GET(
      new NextRequest('http://localhost/api/users'),
      context,
    );

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.code).toBe('UNAUTHORIZED');
  });

  it('returns 409 when onboarding is required', async () => {
    resolveNodeProvisioningAccessMock.mockResolvedValue({
      status: 'ONBOARDING_REQUIRED',
      code: 'ONBOARDING_INCOMPLETE',
      message: 'Onboarding required',
    });

    const response = await GET(
      new NextRequest('http://localhost/api/users'),
      context,
    );

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.code).toBe('ONBOARDING_REQUIRED');
  });

  it('returns 200 for provisioned access', async () => {
    resolveNodeProvisioningAccessMock.mockResolvedValue({
      status: 'ALLOWED',
      identity: { id: 'u-1' },
      tenant: { tenantId: 't-1', userId: 'u-1' },
      user: { id: 'u-1', onboardingComplete: true },
    });

    const response = await GET(
      new NextRequest('http://localhost/api/users'),
      context,
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('ok');
    expect(Array.isArray(body.data)).toBe(true);
  });
});
