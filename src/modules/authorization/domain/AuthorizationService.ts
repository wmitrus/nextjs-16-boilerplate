import type {
  AuthorizationContext,
  AuthorizationService,
} from '@/core/contracts/authorization';
import type { PolicyRepository } from '@/core/contracts/repositories';

import type { PolicyEngine } from './policy/PolicyEngine';

/**
 * DefaultAuthorizationService connects the repository of policies
 * with the policy evaluation engine.
 * Single responsibility: fetch policies + evaluate access.
 */
export class DefaultAuthorizationService implements AuthorizationService {
  constructor(
    private policyRepository: PolicyRepository,
    private engine: PolicyEngine,
  ) {}

  async can(context: AuthorizationContext): Promise<boolean> {
    const policies = await this.policyRepository.getPolicies(context);
    return await this.engine.evaluate(context, policies);
  }
}
