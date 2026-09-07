import type {
  FeatureFlagEvaluationContext,
  FeatureFlagService,
} from '@/core/contracts/feature-flags';
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
    context: FeatureFlagEvaluationContext,
  ): Promise<boolean> {
    try {
      return await this.delegate.isEnabled(flag, context);
    } catch (error) {
      logger.warn(
        {
          event: 'feature-flag:evaluation-error',
          flag,
          errorMessage: error instanceof Error ? error.message : String(error),
          errorName: error instanceof Error ? error.name : 'UnknownError',
        },
        'Feature flag evaluation failed; defaulting to false (fail-safe)',
      );
      return false;
    }
  }
}
