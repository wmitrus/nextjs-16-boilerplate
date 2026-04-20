import type {
  ExternalAuthProvider,
  Identity,
  RequestIdentitySource,
} from '@/core/contracts/identity';
import { TenantNotProvisionedError } from '@/core/contracts/identity';
import {
  MissingTenantContextError,
  type TenantContext,
  type TenantResolver,
} from '@/core/contracts/tenancy';

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
    const { orgExternalId } = await this.source.get();

    if (!orgExternalId) {
      throw new MissingTenantContextError();
    }

    if (this.options.lookup && this.options.provider) {
      const internalOrganizationId =
        await this.options.lookup.findInternalOrganizationId(
          this.options.provider,
          orgExternalId,
        );

      if (internalOrganizationId === null) {
        throw new TenantNotProvisionedError();
      }

      return {
        organizationId: internalOrganizationId,
        tenantId: internalOrganizationId,
        userId: identity.id,
      };
    }

    return {
      organizationId: orgExternalId,
      tenantId: orgExternalId,
      userId: identity.id,
    };
  }
}
