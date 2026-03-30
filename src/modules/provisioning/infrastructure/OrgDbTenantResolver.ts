import type { Identity } from '@/core/contracts/identity';
import type { MembershipRepository } from '@/core/contracts/repositories';
import {
  MissingTenantContextError,
  TenantMembershipRequiredError,
  type TenantContext,
  type TenantResolver,
} from '@/core/contracts/tenancy';

import type { ActiveTenantContextSource } from './request-context/ActiveTenantContextSource';

/**
 * TENANCY_MODE=org + TENANT_CONTEXT_SOURCE=db
 *
 * Org context comes from the app-level request context (header/cookie).
 * Does NOT interpret provider claims — the active tenant is selected by the app UI.
 *
 * Steps:
 * 1. Read active tenant ID from ActiveTenantContextSource (header > cookie priority).
 * 2. Verify the user has membership in that tenant (read-only check).
 * 3. Return TenantContext.
 *
 * Throws:
 * - MissingTenantContextError: if no active tenant ID in request context
 * - TenantMembershipRequiredError: if user has no membership for the active tenant
 */
export class OrgDbTenantResolver implements TenantResolver {
  constructor(
    private readonly activeTenantSource: ActiveTenantContextSource,
    private readonly membershipRepository: MembershipRepository,
  ) {}

  async resolve(identity: Identity): Promise<TenantContext> {
    const activeTenantId = await this.activeTenantSource.getActiveTenantId();

    if (!activeTenantId) {
      throw new MissingTenantContextError(
        'Missing tenant context: no active tenant ID found in request headers or cookies. ' +
          'Set the tenant selector in the app UI before making requests.',
      );
    }

    const isMember = await this.membershipRepository.isMember(
      identity.id,
      activeTenantId,
    );

    if (!isMember) {
      throw new TenantMembershipRequiredError();
    }

    return {
      tenantId: activeTenantId,
      userId: identity.id,
    };
  }
}
