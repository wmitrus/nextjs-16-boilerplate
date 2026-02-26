import type {
  AuthorizationContext,
  AuthorizationService,
} from '@/core/contracts/authorization';
import type {
  MembershipRepository,
  PolicyRepository,
} from '@/core/contracts/repositories';

import type { PolicyEngine } from './policy/PolicyEngine';

/**
 * DefaultAuthorizationService connects the repository of policies
 * with the policy evaluation engine.
 * Single responsibility: fetch policies + evaluate access.
 */
export class DefaultAuthorizationService implements AuthorizationService {
  constructor(
    private readonly policyRepository: PolicyRepository,
    private readonly membershipRepository: MembershipRepository,
    private readonly engine: PolicyEngine,
  ) {}

  async can(context: AuthorizationContext): Promise<boolean> {
    const memberships = await this.membershipRepository.getTenantMemberships(
      context.subject.id,
    );

    if (!memberships.includes(context.tenant.tenantId)) {
      return false;
    }

    const policies = await this.policyRepository.getPolicies(context);
    return await this.engine.evaluate(context, policies);
  }
}
