import type {
  FeatureFlagEvaluationContext,
  FeatureFlagService,
} from '@/core/contracts/feature-flags';

export async function isFeatureEnabled(
  flag: string,
  context: FeatureFlagEvaluationContext,
  service: FeatureFlagService,
): Promise<boolean> {
  return service.isEnabled(flag, context);
}
