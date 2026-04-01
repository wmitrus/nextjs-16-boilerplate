import type { AuthorizationContext } from '@/core/contracts/authorization';
import type { FeatureFlagService } from '@/core/contracts/feature-flags';
import { resolveServerLogger } from '@/core/logger/di';

const logger = resolveServerLogger().child({
  type: 'API',
  category: 'flags',
  module: 'feature-flags',
});

export class ResilientFeatureFlagService implements FeatureFlagService {
  constructor(private readonly delegate: FeatureFlagService) {}

  async isEnabled(
    flag: string,
    context: AuthorizationContext,
  ): Promise<boolean> {
    try {
      return await this.delegate.isEnabled(flag, context);
    } catch (error) {
      logger.warn(
        {
          event: 'feature-flag:evaluation-error',
          flag,
          error,
        },
        'Feature flag evaluation failed; defaulting to false (fail-safe)',
      );
      return false;
    }
  }
}
