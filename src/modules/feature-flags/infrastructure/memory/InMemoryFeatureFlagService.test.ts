import { describe, expect, it } from 'vitest';

import type { AuthorizationContext } from '@/core/contracts/authorization';

import { InMemoryFeatureFlagService } from './InMemoryFeatureFlagService';

const ctx: AuthorizationContext = {
  tenant: { tenantId: 't1' },
  subject: { id: 'u1' },
  resource: { type: 'doc' },
  action: 'doc:read',
};

describe('InMemoryFeatureFlagService', () => {
  it('returns false for all flags when initialized with no flags', async () => {
    const service = new InMemoryFeatureFlagService();

    expect(await service.isEnabled('new-ui', ctx)).toBe(false);
    expect(await service.isEnabled('beta-feature', ctx)).toBe(false);
  });

  it('returns true for a flag set to true', async () => {
    const service = new InMemoryFeatureFlagService({ 'new-ui': true });

    expect(await service.isEnabled('new-ui', ctx)).toBe(true);
  });

  it('returns false for a flag explicitly set to false', async () => {
    const service = new InMemoryFeatureFlagService({ 'new-ui': false });

    expect(await service.isEnabled('new-ui', ctx)).toBe(false);
  });

  it('returns false for an unknown flag', async () => {
    const service = new InMemoryFeatureFlagService({ 'known-flag': true });

    expect(await service.isEnabled('unknown-flag', ctx)).toBe(false);
  });
});
