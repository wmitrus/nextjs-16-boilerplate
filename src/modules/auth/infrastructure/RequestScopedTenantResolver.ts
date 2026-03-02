import type {
  Identity,
  RequestIdentitySource,
} from '@/core/contracts/identity';
import {
  MissingTenantContextError,
  type TenantContext,
  type TenantResolver,
} from '@/core/contracts/tenancy';

import type {
  ExternalAuthProvider,
  ExternalIdentityMapper,
} from './ExternalIdentityMapper';

interface RequestScopedTenantResolverOptions {
  mapper?: Pick<
    ExternalIdentityMapper,
    'resolveOrCreateInternalTenantId' | 'ensureTenantAccess'
  >;
  provider?: ExternalAuthProvider;
}

export class RequestScopedTenantResolver implements TenantResolver {
  constructor(
    private readonly source: RequestIdentitySource,
    private readonly options: RequestScopedTenantResolverOptions = {},
  ) {}

  async resolve(identity: Identity): Promise<TenantContext> {
    const { orgId } = await this.source.get();

    if (!orgId) {
      throw new MissingTenantContextError();
    }

    let internalTenantId = orgId;

    if (this.options.mapper && this.options.provider) {
      internalTenantId =
        await this.options.mapper.resolveOrCreateInternalTenantId({
          provider: this.options.provider,
          externalTenantId: orgId,
        });

      await this.options.mapper.ensureTenantAccess({
        internalUserId: identity.id,
        internalTenantId,
      });
    }

    return {
      tenantId: internalTenantId,
      userId: identity.id,
    };
  }
}
