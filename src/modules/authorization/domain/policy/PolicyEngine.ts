import type {
  AuthorizationContext,
  Policy,
} from '@/core/contracts/repositories';

export class PolicyEngine {
  async evaluate(
    context: AuthorizationContext,
    policies: Policy[],
  ): Promise<boolean> {
    if (policies.length === 0) {
      return false;
    }

    let isAllowed = false;

    for (const policy of policies) {
      if (policy.effect === 'deny') {
        const conditionMet = policy.condition
          ? await policy.condition(context)
          : true;

        if (conditionMet) {
          // Deny-overrides: if any deny policy matches, return false immediately
          return false;
        }
      }

      if (policy.effect === 'allow') {
        const conditionMet = policy.condition
          ? await policy.condition(context)
          : true;

        if (conditionMet) {
          isAllowed = true;
        }
      }
    }

    return isAllowed;
  }
}
