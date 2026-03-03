import type {
  ExternalAuthProvider,
  Identity,
  InternalIdentityLookup,
  RequestIdentitySource,
} from '@/core/contracts/identity';
import { TenantNotProvisionedError } from '@/core/contracts/identity';
import {
  MissingTenantContextError,
  type TenantContext,
  type TenantResolver,
} from '@/core/contracts/tenancy';

/**
 * TENANCY_MODE=org + TENANT_CONTEXT_SOURCE=provider
 *
 * Org context comes from the auth provider's org claim (e.g. Clerk Organizations).
 * Reads tenantExternalId from RequestIdentitySource, then resolves internal tenant UUID via DB lookup.
 *
 * Throws:
 * - MissingTenantContextError: if no tenantExternalId in provider claims
 * - TenantNotProvisionedError: if no internal mapping exists (onboarding required)
 */
export class OrgProviderTenantResolver implements TenantResolver {
  constructor(
    private readonly source: RequestIdentitySource,
    private readonly lookup: InternalIdentityLookup,
    private readonly provider: ExternalAuthProvider,
  ) {}

  async resolve(identity: Identity): Promise<TenantContext> {
    const { tenantExternalId } = await this.source.get();

    if (!tenantExternalId) {
      throw new MissingTenantContextError(
        'Missing tenant context: auth provider did not supply tenantExternalId claim. ' +
          'Ensure the user belongs to an organization in the auth provider.',
      );
    }

    const internalTenantId = await this.lookup.findInternalTenantId(
      this.provider,
      tenantExternalId,
    );

    if (!internalTenantId) {
      throw new TenantNotProvisionedError(
        'Tenant not provisioned. The organization exists in the auth provider but has no internal mapping. ' +
          'Complete onboarding to provision the tenant.',
      );
    }

    return {
      tenantId: internalTenantId,
      userId: identity.id,
    };
  }
}
