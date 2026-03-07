import { describe, expect, it, vi } from 'vitest';

import {
  MissingTenantContextError,
  TenantMembershipRequiredError,
} from '@/core/contracts/tenancy';

import { OrgDbTenantResolver } from './OrgDbTenantResolver';

const makeActiveTenantSource = (tenantId: string | null) => ({
  getActiveTenantId: vi.fn().mockResolvedValue(tenantId),
});

const makeMembershipRepo = (isMember: boolean) => ({
  isMember: vi.fn().mockResolvedValue(isMember),
});

describe('OrgDbTenantResolver', () => {
  const identity = { id: '00000000-0000-0000-0000-000000000999' };
  const tenantId = '10000000-0000-4000-8000-000000000001';

  it('returns tenant context when user is a member of the active tenant', async () => {
    const source = makeActiveTenantSource(tenantId);
    const membershipRepo = makeMembershipRepo(true);
    const resolver = new OrgDbTenantResolver(source, membershipRepo);

    const context = await resolver.resolve(identity);

    expect(source.getActiveTenantId).toHaveBeenCalled();
    expect(membershipRepo.isMember).toHaveBeenCalledWith(identity.id, tenantId);
    expect(context.tenantId).toBe(tenantId);
    expect(context.userId).toBe(identity.id);
  });

  it('throws MissingTenantContextError when no active tenant in request context', async () => {
    const source = makeActiveTenantSource(null);
    const membershipRepo = makeMembershipRepo(true);
    const resolver = new OrgDbTenantResolver(source, membershipRepo);

    await expect(resolver.resolve(identity)).rejects.toBeInstanceOf(
      MissingTenantContextError,
    );
    expect(membershipRepo.isMember).not.toHaveBeenCalled();
  });

  it('throws TenantMembershipRequiredError when user has no membership in the tenant', async () => {
    const source = makeActiveTenantSource(tenantId);
    const membershipRepo = makeMembershipRepo(false);
    const resolver = new OrgDbTenantResolver(source, membershipRepo);

    await expect(resolver.resolve(identity)).rejects.toBeInstanceOf(
      TenantMembershipRequiredError,
    );
  });

  it('does not auto-provision or create records (read-only check)', async () => {
    const source = makeActiveTenantSource(tenantId);
    const membershipRepo = {
      isMember: vi.fn().mockResolvedValue(false),
    };
    const resolver = new OrgDbTenantResolver(source, membershipRepo);

    await expect(resolver.resolve(identity)).rejects.toBeInstanceOf(
      TenantMembershipRequiredError,
    );
    expect(membershipRepo.isMember).toHaveBeenCalledTimes(1);
  });
});
