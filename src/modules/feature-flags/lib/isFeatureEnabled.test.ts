import { describe, expect, it, vi } from 'vitest';

import type { AuthorizationContext } from '@/core/contracts/authorization';
import type { FeatureFlagService } from '@/core/contracts/feature-flags';

import { isFeatureEnabled } from './isFeatureEnabled';

describe('isFeatureEnabled', () => {
  it('delegates feature evaluation to the configured service', async () => {
    const context = {
      subject: { id: 'user-1' },
      resource: { type: 'dashboard' },
      environment: {},
    } as AuthorizationContext;
    const service: FeatureFlagService = {
      isEnabled: vi.fn().mockResolvedValue(true),
    };

    await expect(
      isFeatureEnabled('new-dashboard-ui', context, service),
    ).resolves.toBe(true);
    expect(service.isEnabled).toHaveBeenCalledWith('new-dashboard-ui', context);
  });
});
