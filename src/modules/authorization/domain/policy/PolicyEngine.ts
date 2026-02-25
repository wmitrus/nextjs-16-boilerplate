import type {
  AuthorizationContext,
  Policy,
} from '@/core/contracts/repositories';

/**
 * Evaluates policies for a given authorization context.
 * Implements "deny-overrides" logic: any deny policy takes precedence.
 * Conditions can be synchronous or asynchronous.
 */
export class PolicyEngine {
  async evaluate(
    context: AuthorizationContext,
    policies: Policy[],
  ): Promise<boolean> {
    if (policies.length === 0) return false;

    let isAllowed = false;

    for (const policy of policies) {
      const conditionMet = policy.condition
        ? await policy.condition(context)
        : true;

      if (policy.effect === 'deny' && conditionMet) {
        return false; // deny-overrides
      }

      if (policy.effect === 'allow' && conditionMet) {
        isAllowed = true;
      }
    }

    return isAllowed;
  }
}
