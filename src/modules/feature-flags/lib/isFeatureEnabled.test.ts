import { describe, expect, it, vi } from 'vitest';

import type {
  FeatureFlagEvaluationContext,
  FeatureFlagService,
} from '@/core/contracts/feature-flags';

import { isFeatureEnabled } from './isFeatureEnabled';

describe('isFeatureEnabled', () => {
  it('delegates feature evaluation to the configured service', async () => {
    const context: FeatureFlagEvaluationContext = {
      scope: { kind: 'platform-global' },
      subject: { kind: 'system', systemSubjectId: 'test' },
    };
    const service: FeatureFlagService = {
      isEnabled: vi.fn().mockResolvedValue(true),
    };

    await expect(
      isFeatureEnabled('new-dashboard-ui', context, service),
    ).resolves.toBe(true);
    expect(service.isEnabled).toHaveBeenCalledWith('new-dashboard-ui', context);
  });
});
