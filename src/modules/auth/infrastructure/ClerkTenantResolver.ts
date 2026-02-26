import { auth } from '@clerk/nextjs/server';

import type { Identity } from '@/core/contracts/identity';
import type { TenantContext, TenantResolver } from '@/core/contracts/tenancy';

export class ClerkTenantResolver implements TenantResolver {
  async resolve(identity: Identity): Promise<TenantContext> {
    const { orgId } = await auth();

    return {
      tenantId: orgId || 'default',
      userId: identity.id,
    };
  }
}
