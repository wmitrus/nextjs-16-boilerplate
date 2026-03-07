/** @vitest-environment node */
import { describe, expect, it, vi } from 'vitest';

import type { RequestIdentitySource } from '@/core/contracts/identity';
import { TenantNotProvisionedError } from '@/core/contracts/identity';
import { MissingTenantContextError } from '@/core/contracts/tenancy';

import { RequestScopedTenantResolver } from './RequestScopedTenantResolver';

function makeSource(data: {
  userId?: string;
  email?: string;
  tenantExternalId?: string;
  tenantRole?: string;
}): RequestIdentitySource {
  return { get: vi.fn().mockResolvedValue(data) };
}

describe('RequestScopedTenantResolver', () => {
  it('resolves tenant from tenantExternalId (no lookup — passthrough)', async () => {
    const resolver = new RequestScopedTenantResolver(
      makeSource({ tenantExternalId: 'org_123' }),
    );
    const context = await resolver.resolve({ id: 'user_internal_uuid' });

    expect(context).toEqual({
      tenantId: 'org_123',
      userId: 'user_internal_uuid',
    });
  });

  it('throws MissingTenantContextError when tenantExternalId is absent', async () => {
    const resolver = new RequestScopedTenantResolver(makeSource({}));
    await expect(
      resolver.resolve({ id: 'user_internal_uuid' }),
    ).rejects.toBeInstanceOf(MissingTenantContextError);
  });

  it('throws MissingTenantContextError when tenantExternalId is undefined', async () => {
    const resolver = new RequestScopedTenantResolver(
      makeSource({ tenantExternalId: undefined }),
    );
    await expect(
      resolver.resolve({ id: 'user_internal_uuid' }),
    ).rejects.toBeInstanceOf(MissingTenantContextError);
  });

  it('maps external tenantExternalId to internal tenant id via lookup', async () => {
    const lookup = {
      findInternalUserId: vi.fn(),
      findInternalTenantId: vi
        .fn()
        .mockResolvedValue('10000000-0000-0000-0000-000000000123'),
      findPersonalTenantId: vi.fn(),
    };

    const resolver = new RequestScopedTenantResolver(
      makeSource({ tenantExternalId: 'org_123' }),
      { lookup, provider: 'clerk' },
    );

    const context = await resolver.resolve({
      id: '00000000-0000-0000-0000-000000000999',
    });

    expect(lookup.findInternalTenantId).toHaveBeenCalledWith(
      'clerk',
      'org_123',
    );
    expect(context).toEqual({
      tenantId: '10000000-0000-0000-0000-000000000123',
      userId: '00000000-0000-0000-0000-000000000999',
    });
  });

  it('throws TenantNotProvisionedError when lookup returns null (tenant not provisioned)', async () => {
    const lookup = {
      findInternalUserId: vi.fn(),
      findInternalTenantId: vi.fn().mockResolvedValue(null),
      findPersonalTenantId: vi.fn(),
    };

    const resolver = new RequestScopedTenantResolver(
      makeSource({ tenantExternalId: 'org_unprovisioned' }),
      { lookup, provider: 'clerk' },
    );

    await expect(
      resolver.resolve({ id: '00000000-0000-0000-0000-000000000999' }),
    ).rejects.toBeInstanceOf(TenantNotProvisionedError);
  });

  it('does not call write-path methods — lookup is read-only (regression)', async () => {
    const lookup = {
      findInternalUserId: vi.fn(),
      findInternalTenantId: vi
        .fn()
        .mockResolvedValue('10000000-0000-4000-8000-000000000001'),
      findPersonalTenantId: vi.fn(),
    };
    const insert = vi.fn();

    const resolver = new RequestScopedTenantResolver(
      makeSource({ tenantExternalId: 'org_123' }),
      { lookup, provider: 'clerk' },
    );

    await resolver.resolve({ id: 'some-internal-uuid' });

    expect(insert).not.toHaveBeenCalled();
    expect(lookup.findInternalUserId).not.toHaveBeenCalled();
  });
});
