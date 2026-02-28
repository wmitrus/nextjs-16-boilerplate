import type { AuthorizationContext } from '@/core/contracts/authorization';
import type { FeatureFlagService } from '@/core/contracts/feature-flags';

export class InMemoryFeatureFlagService implements FeatureFlagService {
  constructor(private readonly flags: Record<string, boolean> = {}) {}

  async isEnabled(
    flag: string,
    _context: AuthorizationContext,
  ): Promise<boolean> {
    return this.flags[flag] ?? false;
  }
}
