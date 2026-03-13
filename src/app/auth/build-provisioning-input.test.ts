import { describe, it, expect, beforeEach } from 'vitest';

import type { RequestIdentitySourceData } from '@/core/contracts/identity';

import { buildProvisioningInput } from './build-provisioning-input';

import {
  mockEnv,
  mockCookies,
  mockHeaders,
  resetEnvMocks,
  resetNextHeadersMocks,
  setTenancyProfile,
} from '@/testing';

const stubIdentity: RequestIdentitySourceData = {
  userId: 'user_ext_1',
  email: 'user@example.com',
  emailVerified: true,
  tenantExternalId: undefined,
  tenantRole: undefined,
};

describe('buildProvisioningInput', () => {
  beforeEach(() => {
    resetEnvMocks();
    resetNextHeadersMocks();
  });

  it('returns DEFAULT_TENANT_ID as activeTenantId in single mode', async () => {
    setTenancyProfile({
      tenancyMode: 'single',
      defaultTenantId: '10000000-0000-4000-8000-000000000001',
    });

    const result = await buildProvisioningInput(stubIdentity);

    expect(result.activeTenantId).toBe('10000000-0000-4000-8000-000000000001');
    expect(result.externalUserId).toBe('user_ext_1');
    expect(result.tenancyMode).toBe('single');
    expect(result.provider).toBe('clerk');
  });

  it('returns undefined as activeTenantId in personal mode', async () => {
    setTenancyProfile({ tenancyMode: 'personal' });

    const result = await buildProvisioningInput(stubIdentity);

    expect(result.activeTenantId).toBeUndefined();
    expect(result.tenancyMode).toBe('personal');
  });

  it('returns undefined as activeTenantId in org+provider mode', async () => {
    setTenancyProfile({ tenancyMode: 'org', tenantContextSource: 'provider' });

    const result = await buildProvisioningInput(stubIdentity);

    expect(result.activeTenantId).toBeUndefined();
    expect(result.tenancyMode).toBe('org');
    expect(result.tenantContextSource).toBe('provider');
  });

  it('returns header value as activeTenantId in org+db mode when header is present', async () => {
    setTenancyProfile({ tenancyMode: 'org', tenantContextSource: 'db' });
    mockEnv.TENANT_CONTEXT_HEADER = 'x-tenant-id';
    mockHeaders.set('x-tenant-id', 'tenant-from-header');

    const result = await buildProvisioningInput(stubIdentity);

    expect(result.activeTenantId).toBe('tenant-from-header');
  });

  it('returns cookie value as activeTenantId in org+db mode when no header but cookie is present', async () => {
    setTenancyProfile({ tenancyMode: 'org', tenantContextSource: 'db' });
    mockEnv.TENANT_CONTEXT_HEADER = 'x-tenant-id';
    mockEnv.TENANT_CONTEXT_COOKIE = 'active_tenant_id';
    mockCookies.mockImplementation(async () => ({
      get: (name: string) =>
        name === 'active_tenant_id'
          ? { value: 'tenant-from-cookie' }
          : undefined,
    }));

    const result = await buildProvisioningInput(stubIdentity);

    expect(result.activeTenantId).toBe('tenant-from-cookie');
  });

  it('returns undefined as activeTenantId in org+db mode when neither header nor cookie is present', async () => {
    setTenancyProfile({ tenancyMode: 'org', tenantContextSource: 'db' });
    mockEnv.TENANT_CONTEXT_HEADER = 'x-tenant-id';
    mockEnv.TENANT_CONTEXT_COOKIE = 'active_tenant_id';
    mockCookies.mockImplementation(async () => ({
      get: () => undefined,
    }));

    const result = await buildProvisioningInput(stubIdentity);

    expect(result.activeTenantId).toBeUndefined();
  });
});
