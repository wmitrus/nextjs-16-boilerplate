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
  private matchesAction(
    context: AuthorizationContext,
    policy: Policy,
  ): boolean {
    return policy.actions.includes(context.action);
  }

  private matchesResource(
    context: AuthorizationContext,
    policy: Policy,
  ): boolean {
    return (
      policy.resource === 'all' || policy.resource === context.resource.type
    );
  }

  async evaluate(
    context: AuthorizationContext,
    policies: Policy[],
  ): Promise<boolean> {
    if (policies.length === 0) return false;

    let isAllowed = false;

    for (const policy of policies) {
      if (!this.matchesAction(context, policy)) {
        continue;
      }

      if (!this.matchesResource(context, policy)) {
        continue;
      }

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
