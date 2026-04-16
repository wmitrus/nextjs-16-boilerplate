import { describe, expect, it, vi, beforeEach } from 'vitest';

import type { AuthorizationContext } from '@/core/contracts/authorization';

/**
 * Unit tests for GrowthBookFeatureFlagService using a full module mock.
 *
 * MSW-based integration testing for GrowthBook HTTP calls requires module
 * isolation (dynamic import) to avoid the module-level `clientCache`
 * singleton capturing `polyfills.fetch` before MSW can intercept.
 * MSW handlers are provided in `./__mocks__/handlers.ts` for use in
 * future integration test contexts.
 */
const mockClient = vi.hoisted(() => ({
  init: vi.fn().mockResolvedValue({}),
  isOn: vi.fn().mockReturnValue(false),
}));

const GrowthBookClientMock = vi.hoisted(() =>
  vi.fn().mockImplementation(function () {
    return mockClient;
  }),
);

vi.mock('@growthbook/growthbook', () => ({
  GrowthBookClient: GrowthBookClientMock,
}));

import { GrowthBookFeatureFlagService } from './GrowthBookFeatureFlagService';

const ctx: AuthorizationContext = {
  tenant: { tenantId: 'tenant-1' },
  subject: { id: 'user-1' },
  resource: { type: 'feature' },
  action: 'feature:read',
};

describe('GrowthBookFeatureFlagService', () => {
  beforeEach(() => {
    mockClient.init.mockClear();
    mockClient.isOn.mockClear();
    GrowthBookClientMock.mockClear();
    mockClient.init.mockResolvedValue({});
    mockClient.isOn.mockReturnValue(false);
  });

  it('calls init without streaming to avoid persistent SSE connections in server context', async () => {
    const svc = new GrowthBookFeatureFlagService({
      clientKey: 'sdk-key-init-test',
      apiHost: 'https://cdn.growthbook.io',
    });

    await svc.isEnabled('some-flag', ctx);

    expect(mockClient.init).toHaveBeenCalledWith({
      timeout: 2000,
    });
    expect(mockClient.init).not.toHaveBeenCalledWith(
      expect.objectContaining({ streaming: true }),
    );
  });

  it('does not call refreshFeatures on each evaluation — flags are served from init cache', async () => {
    const svc = new GrowthBookFeatureFlagService({
      clientKey: 'sdk-key-no-refresh-test',
      apiHost: 'https://cdn.growthbook.io',
    });

    await svc.isEnabled('some-flag', ctx);

    expect('refreshFeatures' in mockClient).toBe(false);
    expect(mockClient.isOn).toHaveBeenCalledOnce();
  });

  it('returns false when GrowthBook reports flag is off', async () => {
    mockClient.isOn.mockReturnValue(false);
    const svc = new GrowthBookFeatureFlagService({
      clientKey: 'sdk-key-off-test',
      apiHost: 'https://cdn.growthbook.io',
    });

    expect(await svc.isEnabled('disabled-flag', ctx)).toBe(false);
  });

  it('returns true when GrowthBook reports flag is on', async () => {
    mockClient.isOn.mockReturnValue(true);
    const svc = new GrowthBookFeatureFlagService({
      clientKey: 'sdk-key-on-test',
      apiHost: 'https://cdn.growthbook.io',
    });

    expect(await svc.isEnabled('enabled-flag', ctx)).toBe(true);
  });

  it('passes flag key and per-request user attributes to isOn', async () => {
    const svc = new GrowthBookFeatureFlagService({
      clientKey: 'sdk-key-attrs-test',
      apiHost: 'https://cdn.growthbook.io',
    });

    await svc.isEnabled('any-flag', ctx);

    expect(mockClient.isOn).toHaveBeenCalledWith('any-flag', {
      attributes: {
        id: 'user-1',
        company: 'tenant-1',
      },
    });
  });

  it('creates separate client instances for different apiHost values with same clientKey', async () => {
    const svc1 = new GrowthBookFeatureFlagService({
      clientKey: 'sdk-key-host-test',
      apiHost: 'https://cdn.growthbook.io',
    });
    const svc2 = new GrowthBookFeatureFlagService({
      clientKey: 'sdk-key-host-test',
      apiHost: 'https://self-hosted.example.com',
    });

    await svc1.isEnabled('flag-a', ctx);
    await svc2.isEnabled('flag-b', ctx);

    expect(GrowthBookClientMock).toHaveBeenCalledWith({
      clientKey: 'sdk-key-host-test',
      apiHost: 'https://cdn.growthbook.io',
    });
    expect(GrowthBookClientMock).toHaveBeenCalledWith({
      clientKey: 'sdk-key-host-test',
      apiHost: 'https://self-hosted.example.com',
    });
  });
});
