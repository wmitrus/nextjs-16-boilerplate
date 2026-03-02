import type {
  Identity,
  RequestIdentitySource,
} from '@/core/contracts/identity';
import { TenantNotProvisionedError } from '@/core/contracts/identity';
import {
  MissingTenantContextError,
  type TenantContext,
  type TenantResolver,
} from '@/core/contracts/tenancy';

import type { ExternalAuthProvider } from './ExternalIdentityMapper';
import type { InternalIdentityLookup } from './InternalIdentityLookup';

interface RequestScopedTenantResolverOptions {
  lookup?: InternalIdentityLookup;
  provider?: ExternalAuthProvider;
}

export class RequestScopedTenantResolver implements TenantResolver {
  constructor(
    private readonly source: RequestIdentitySource,
    private readonly options: RequestScopedTenantResolverOptions = {},
  ) {}

  async resolve(identity: Identity): Promise<TenantContext> {
    const { tenantExternalId } = await this.source.get();

    if (!tenantExternalId) {
      throw new MissingTenantContextError();
    }

    if (this.options.lookup && this.options.provider) {
      const internalTenantId = await this.options.lookup.findInternalTenantId(
        this.options.provider,
        tenantExternalId,
      );

      if (internalTenantId === null) {
        throw new TenantNotProvisionedError();
      }

      return {
        tenantId: internalTenantId,
        userId: identity.id,
      };
    }

    return {
      tenantId: tenantExternalId,
      userId: identity.id,
    };
  }
}
