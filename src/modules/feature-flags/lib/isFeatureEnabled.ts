import type { AuthorizationContext } from '@/core/contracts/authorization';
import type { FeatureFlagService } from '@/core/contracts/feature-flags';

export async function isFeatureEnabled(
  flag: string,
  context: AuthorizationContext,
  service: FeatureFlagService,
): Promise<boolean> {
  return service.isEnabled(flag, context);
}
