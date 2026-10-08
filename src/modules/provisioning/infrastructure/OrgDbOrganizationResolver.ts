import type { Identity } from '@/core/contracts/identity';
import {
  MissingTenantContextError,
  type TenantContext,
  type TenantResolver,
} from '@/core/contracts/tenancy';

import type { ActiveTenantContextSource } from './request-context/ActiveTenantContextSource';

/**
 * TENANT_CONTEXT_SOURCE=db selection adapter.
 *
 * Request-time topology is no longer selected by TENANCY_MODE.
 * Org context comes from the app-level request context (header/cookie).
 * Does NOT interpret provider claims — the active organization is selected by the app UI.
 *
 * Steps:
 * 1. Read active organization ID from ActiveTenantContextSource (header > cookie priority).
 * 2. Return the selected internal organization as legacy TenantContext.
 * Membership authority is verified centrally by the Node access evaluator.
 *
 * Throws:
 * - MissingTenantContextError: if no active organization ID in request context
 */
export class OrgDbOrganizationResolver implements TenantResolver {
  constructor(private readonly activeTenantSource: ActiveTenantContextSource) {}

  async resolve(identity: Identity): Promise<TenantContext> {
    const activeTenantId = await this.activeTenantSource.getActiveTenantId();

    if (!activeTenantId) {
      throw new MissingTenantContextError(
        'Missing tenant context: no active organization ID found in request headers or cookies. ' +
          'Set the tenant selector in the app UI before making requests.',
      );
    }

    return {
      organizationId: activeTenantId,
      tenantId: activeTenantId,
      userId: identity.id,
    };
  }
}
