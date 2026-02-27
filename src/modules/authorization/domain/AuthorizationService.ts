import type {
  AuthorizationContext,
  AuthorizationService,
} from '@/core/contracts/authorization';
import type {
  MembershipRepository,
  PolicyRepository,
  TenantAttributesRepository,
} from '@/core/contracts/repositories';

import type { PolicyEngine } from './policy/PolicyEngine';

/**
 * DefaultAuthorizationService orchestrates the full authorization decision:
 *
 * 1. Tenant membership guard — fails fast if subject is not a member.
 * 2. Tenant attributes hydration — enriches context with plan, features, etc.
 *    (Billing writes to DB; authorization reads from DB — never calls Stripe.)
 * 3. Policy evaluation — delegates to PolicyEngine with enriched context.
 *
 * Single responsibility: fetch data + evaluate access.
 * Must NOT know about frameworks, HTTP, or Clerk.
 */
export class DefaultAuthorizationService implements AuthorizationService {
  constructor(
    private readonly policyRepository: PolicyRepository,
    private readonly membershipRepository: MembershipRepository,
    private readonly tenantAttributesRepository: TenantAttributesRepository,
    private readonly engine: PolicyEngine,
  ) {}

  async can(context: AuthorizationContext): Promise<boolean> {
    const memberships = await this.membershipRepository.getTenantMemberships(
      context.subject.id,
    );

    if (!memberships.includes(context.tenant.tenantId)) {
      return false;
    }

    const tenantAttributes =
      await this.tenantAttributesRepository.getTenantAttributes(
        context.tenant.tenantId,
      );

    const enrichedContext: AuthorizationContext = {
      ...context,
      tenantAttributes,
    };

    const policies = await this.policyRepository.getPolicies(enrichedContext);
    return await this.engine.evaluate(enrichedContext, policies);
  }
}
