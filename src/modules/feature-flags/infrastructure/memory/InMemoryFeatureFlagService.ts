import type {
  FeatureFlagEvaluationContext,
  FeatureFlagService,
} from '@/core/contracts/feature-flags';

export class InMemoryFeatureFlagService implements FeatureFlagService {
  private readonly flagMap: Map<string, boolean>;

  constructor(flags: Record<string, boolean> = {}) {
    this.flagMap = new Map(Object.entries(flags));
  }

  async isEnabled(
    flag: string,
    _context: FeatureFlagEvaluationContext,
  ): Promise<boolean> {
    return this.flagMap.get(flag) ?? false;
  }
}
