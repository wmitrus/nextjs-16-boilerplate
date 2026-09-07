import { describe, expect, it, vi, beforeEach } from 'vitest';

import {
  internalOrganizationIdFromOrgRow,
  internalUserIdFromUsersRow,
  parentTenantIdFromOrgRow,
} from '@/core/contracts/canonical-ids.provenance';
import type { FeatureFlagEvaluationContext } from '@/core/contracts/feature-flags';

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

const ORG_A = '11111111-1111-1111-1111-111111111111';
const TENANT_A = '22222222-2222-2222-2222-222222222222';
const USER_1 = '33333333-3333-3333-3333-333333333333';

const ctx: FeatureFlagEvaluationContext = {
  scope: {
    kind: 'organization',
    organizationId: internalOrganizationIdFromOrgRow(ORG_A),
    tenantId: parentTenantIdFromOrgRow(TENANT_A),
  },
  subject: { kind: 'user', userId: internalUserIdFromUsersRow(USER_1) },
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

  it('passes flag key, subject id, and the canonical OrganizationId as company for organization scope', async () => {
    const svc = new GrowthBookFeatureFlagService({
      clientKey: 'sdk-key-attrs-test',
      apiHost: 'https://cdn.growthbook.io',
    });

    await svc.isEnabled('any-flag', ctx);

    expect(mockClient.isOn).toHaveBeenCalledWith('any-flag', {
      attributes: {
        id: USER_1,
        company: ORG_A,
      },
    });
  });

  it('does not use TenantId for company (locked FF·D decision)', async () => {
    const svc = new GrowthBookFeatureFlagService({
      clientKey: 'sdk-key-no-tenant-company',
      apiHost: 'https://cdn.growthbook.io',
    });

    await svc.isEnabled('any-flag', ctx);

    const call = mockClient.isOn.mock.calls[0] as
      | [string, { attributes: Record<string, unknown> }]
      | undefined;
    expect(call?.[1].attributes.company).not.toBe(TENANT_A);
  });

  it('uses the stable systemSubjectId as id for a system subject', async () => {
    const svc = new GrowthBookFeatureFlagService({
      clientKey: 'sdk-key-system-subject',
      apiHost: 'https://cdn.growthbook.io',
    });
    const systemCtx: FeatureFlagEvaluationContext = {
      scope: { kind: 'platform-global' },
      subject: { kind: 'system', systemSubjectId: 'operational-switch' },
    };

    await svc.isEnabled('any-flag', systemCtx);

    expect(mockClient.isOn).toHaveBeenCalledWith('any-flag', {
      attributes: { id: 'operational-switch' },
    });
  });

  it('does not fabricate a company attribute for platform-global scope', async () => {
    const svc = new GrowthBookFeatureFlagService({
      clientKey: 'sdk-key-platform-global',
      apiHost: 'https://cdn.growthbook.io',
    });
    const platformCtx: FeatureFlagEvaluationContext = {
      scope: { kind: 'platform-global' },
      subject: { kind: 'system', systemSubjectId: 'operational-switch' },
    };

    await svc.isEnabled('any-flag', platformCtx);

    const call = mockClient.isOn.mock.calls[0] as
      | [string, { attributes: Record<string, unknown> }]
      | undefined;
    expect(call?.[1].attributes).not.toHaveProperty('company');
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
