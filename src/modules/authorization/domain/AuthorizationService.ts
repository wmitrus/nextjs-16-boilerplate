import type {
  AuthorizationContext,
  AuthorizationService,
} from '@/core/contracts/authorization';
import type {
  MembershipRepository,
  PolicyRepository,
  RoleRepository,
  TenantAttributesRepository,
} from '@/core/contracts/repositories';

import type { PolicyEngine } from './policy/PolicyEngine';

/**
 * DefaultAuthorizationService orchestrates the full authorization decision:
 *
 * 1. Tenant membership guard — fails fast if subject is not a member.
 * 2. Role resolution — fetches tenant-scoped roles and merges into subject context.
 * 3. Tenant attributes hydration — enriches context with plan, features, etc.
 *    (Billing writes to DB; authorization reads from DB — never calls Stripe.)
 * 4. Policy evaluation — delegates to PolicyEngine with enriched context.
 *
 * Single responsibility: fetch data + evaluate access.
 * Must NOT know about frameworks, HTTP, or Clerk.
 */
export class DefaultAuthorizationService implements AuthorizationService {
  constructor(
    private readonly policyRepository: PolicyRepository,
    private readonly membershipRepository: MembershipRepository,
    private readonly roleRepository: RoleRepository,
    private readonly tenantAttributesRepository: TenantAttributesRepository,
    private readonly engine: PolicyEngine,
  ) {}

  async can(context: AuthorizationContext): Promise<boolean> {
    const isMember = await this.membershipRepository.isMember(
      context.subject.id,
      context.tenant.tenantId,
    );

    if (!isMember) {
      return false;
    }

    const [roles, tenantAttributes] = await Promise.all([
      this.roleRepository.getRoles(context.subject.id, context.tenant.tenantId),
      this.tenantAttributesRepository.getTenantAttributes(
        context.tenant.tenantId,
      ),
    ]);

    const enrichedContext: AuthorizationContext = {
      ...context,
      subject: {
        ...context.subject,
        roles,
      },
      tenantAttributes,
    };

    const policies = await this.policyRepository.getPolicies(enrichedContext);
    return await this.engine.evaluate(enrichedContext, policies);
  }
}
