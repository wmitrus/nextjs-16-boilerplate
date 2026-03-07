import { NextRequest, NextResponse } from 'next/server';
import { describe, expect, it, vi } from 'vitest';

import { withNodeProvisioning } from './with-node-provisioning';

describe('withNodeProvisioning', () => {
  function createRequest(path: string) {
    return new NextRequest(new URL(`http://localhost${path}`));
  }

  const context = { params: Promise.resolve({}) };

  it('returns 401 when access outcome is UNAUTHENTICATED', async () => {
    const handler = withNodeProvisioning(
      async () => NextResponse.json({ ok: true }),
      {
        resolveAccess: async () => ({
          status: 'UNAUTHENTICATED',
          code: 'UNAUTHENTICATED',
          message: 'Authentication required',
        }),
      },
    );

    const response = await handler(createRequest('/api/users'), context);
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.code).toBe('UNAUTHORIZED');
  });

  it('returns 409 when access outcome is ONBOARDING_REQUIRED', async () => {
    const handler = withNodeProvisioning(
      async () => NextResponse.json({ ok: true }),
      {
        resolveAccess: async () => ({
          status: 'ONBOARDING_REQUIRED',
          code: 'ONBOARDING_INCOMPLETE',
          message: 'Onboarding required',
        }),
      },
    );

    const response = await handler(createRequest('/api/users'), context);
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.code).toBe('ONBOARDING_REQUIRED');
  });

  it('returns 409 when access outcome is BOOTSTRAP_REQUIRED', async () => {
    const handler = withNodeProvisioning(
      async () => NextResponse.json({ ok: true }),
      {
        resolveAccess: async () => ({
          status: 'BOOTSTRAP_REQUIRED',
          code: 'BOOTSTRAP_REQUIRED',
          message: 'Bootstrap required',
        }),
      },
    );

    const response = await handler(createRequest('/api/users'), context);
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.code).toBe('BOOTSTRAP_REQUIRED');
  });

  it('returns 409 with DEFAULT_TENANT_NOT_FOUND code when single-tenant config is invalid', async () => {
    const handler = withNodeProvisioning(
      async () => NextResponse.json({ ok: true }),
      {
        resolveAccess: async () => ({
          status: 'TENANT_CONTEXT_REQUIRED',
          code: 'DEFAULT_TENANT_NOT_FOUND',
          message: 'default tenant missing',
        }),
      },
    );

    const response = await handler(createRequest('/api/users'), context);
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.code).toBe('DEFAULT_TENANT_NOT_FOUND');
  });

  it('returns 403 when tenant membership is required', async () => {
    const handler = withNodeProvisioning(
      async () => NextResponse.json({ ok: true }),
      {
        resolveAccess: async () => ({
          status: 'TENANT_MEMBERSHIP_REQUIRED',
          code: 'TENANT_MEMBERSHIP_REQUIRED',
          message: 'membership required',
        }),
      },
    );

    const response = await handler(createRequest('/api/users'), context);
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.code).toBe('TENANT_MEMBERSHIP_REQUIRED');
  });

  it('calls wrapped handler when outcome is ALLOWED', async () => {
    const wrapped = vi.fn(async () => NextResponse.json({ ok: true }));

    const handler = withNodeProvisioning(wrapped, {
      resolveAccess: async () => ({
        status: 'ALLOWED',
        identity: { id: 'u-1' },
        tenant: { tenantId: 't-1', userId: 'u-1' },
        user: {
          id: 'u-1',
          email: 'user@example.com',
          onboardingComplete: true,
        },
      }),
    });

    const response = await handler(createRequest('/api/users'), context);
    expect(response.status).toBe(200);
    expect(wrapped).toHaveBeenCalledTimes(1);
  });
});
