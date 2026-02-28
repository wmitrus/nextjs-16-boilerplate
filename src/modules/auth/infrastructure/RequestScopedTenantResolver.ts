import type {
  Identity,
  RequestIdentitySource,
} from '@/core/contracts/identity';
import type { TenantContext, TenantResolver } from '@/core/contracts/tenancy';

export class RequestScopedTenantResolver implements TenantResolver {
  constructor(private readonly source: RequestIdentitySource) {}

  async resolve(identity: Identity): Promise<TenantContext> {
    const { orgId } = await this.source.get();

    return {
      tenantId: orgId ?? identity.id,
      userId: identity.id,
    };
  }
}
