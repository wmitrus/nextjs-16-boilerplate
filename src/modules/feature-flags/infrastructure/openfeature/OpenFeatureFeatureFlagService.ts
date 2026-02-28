import type { AuthorizationContext } from '@/core/contracts/authorization';
import type { FeatureFlagService } from '@/core/contracts/feature-flags';

export class OpenFeatureFeatureFlagService implements FeatureFlagService {
  async isEnabled(
    _flag: string,
    _context: AuthorizationContext,
  ): Promise<boolean> {
    throw new Error('OpenFeatureFeatureFlagService: not implemented');
  }
}
