import type {
  Identity,
  RequestIdentitySource,
} from '@/core/contracts/identity';
import {
  MissingTenantContextError,
  type TenantContext,
  type TenantResolver,
} from '@/core/contracts/tenancy';

export class RequestScopedTenantResolver implements TenantResolver {
  constructor(private readonly source: RequestIdentitySource) {}

  async resolve(identity: Identity): Promise<TenantContext> {
    const { orgId } = await this.source.get();

    if (!orgId) {
      throw new MissingTenantContextError();
    }

    return {
      tenantId: orgId,
      userId: identity.id,
    };
  }
}
