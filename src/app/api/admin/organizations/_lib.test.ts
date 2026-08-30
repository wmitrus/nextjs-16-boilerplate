import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Action } from '@/core/contracts/authorization';
import { ACTIONS } from '@/core/contracts/resources-actions';

const mocks = vi.hoisted(() => ({
  can: vi.fn(),
  info: vi.fn(),
  isEnvBasedPlatformAdmin: vi.fn(),
}));

vi.mock('@/core/logger/server', () => ({
  logger: { info: mocks.info },
}));

vi.mock('@/security/core/platform-admin', () => ({
  isEnvBasedPlatformAdmin: mocks.isEnvBasedPlatformAdmin,
}));

import {
  checkOrganizationsActionAccess,
  getOrganizationDetailInActiveScope,
  toAdminOrganizationsScope,
} from './_lib';

const adminAccess = { allowed: true, isPlatformAdmin: false };
const platformAdminAccess = { allowed: true, isPlatformAdmin: true };
const activeOrganizationId = '15000000-0000-4000-8000-000000000001';
const organizationId = '15000000-0000-4000-8000-000000000002';

describe('organization boundary telemetry', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.isEnvBasedPlatformAdmin.mockReturnValue(false);
  });

  it('records a normal allowed action using organization scope', async () => {
    mocks.can.mockResolvedValue(true);
    const container = { resolve: vi.fn(() => ({ can: mocks.can })) };

    const result = await checkOrganizationsActionAccess(
      'admin@example.test',
      'user-1',
      'tenant-1',
      container as never,
      ACTIONS.TENANT_UPDATE,
    );

    expect(result).toEqual(adminAccess);
    expect(mocks.info).toHaveBeenCalledWith({
      event: 'security:organization_boundary_decision',
      stage: 'action',
      decision: 'allowed',
      scopeKind: 'organization',
      actionFamily: 'tenant-update',
    });
  });

  it('records a denied action without changing the access result', async () => {
    mocks.can.mockResolvedValue(false);
    const container = { resolve: vi.fn(() => ({ can: mocks.can })) };

    const result = await checkOrganizationsActionAccess(
      'admin@example.test',
      'user-1',
      'tenant-1',
      container as never,
      ACTIONS.TENANT_UPDATE,
    );

    expect(result).toEqual({ allowed: false, isPlatformAdmin: false });
    expect(mocks.info).toHaveBeenCalledWith({
      event: 'security:organization_boundary_decision',
      stage: 'action',
      decision: 'denied',
      scopeKind: 'organization',
      actionFamily: 'tenant-update',
    });
  });

  it('records platform-admin action access using active-tenant scope', async () => {
    mocks.isEnvBasedPlatformAdmin.mockReturnValue(true);

    const result = await checkOrganizationsActionAccess(
      'admin@example.test',
      'user-1',
      'tenant-1',
      { resolve: vi.fn() } as never,
      ACTIONS.TENANT_UPDATE,
    );

    expect(result).toEqual(platformAdminAccess);
    expect(mocks.info).toHaveBeenCalledWith({
      event: 'security:organization_boundary_decision',
      stage: 'action',
      decision: 'allowed',
      scopeKind: 'active-tenant',
      actionFamily: 'tenant-update',
    });
  });

  it('maps an unknown action to the other action family', async () => {
    mocks.can.mockResolvedValue(true);

    await checkOrganizationsActionAccess(
      'admin@example.test',
      'user-1',
      'tenant-1',
      { resolve: vi.fn(() => ({ can: mocks.can })) } as never,
      'security:future_action' as Action,
    );

    expect(mocks.info).toHaveBeenCalledWith({
      event: 'security:organization_boundary_decision',
      stage: 'action',
      decision: 'allowed',
      scopeKind: 'organization',
      actionFamily: 'other',
    });
  });

  it.each([
    ['hit', { organization: { id: organizationId } }],
    ['miss', null],
  ] as const)('records a scoped organization %s', async (decision, result) => {
    const service = {
      getDetailInActiveScope: vi.fn().mockResolvedValue(result),
    };

    await expect(
      getOrganizationDetailInActiveScope(
        service as never,
        toAdminOrganizationsScope(platformAdminAccess, activeOrganizationId),
        organizationId,
        'organization',
      ),
    ).resolves.toBe(result);

    expect(mocks.info).toHaveBeenCalledWith({
      event: 'security:organization_boundary_decision',
      stage: 'scope',
      decision,
      scopeKind: 'active-tenant',
      surface: 'organization',
    });
  });

  it('emits telemetry with no fields beyond the fixed event schema', async () => {
    mocks.can.mockResolvedValue(true);

    await checkOrganizationsActionAccess(
      'admin@example.test',
      'user-1',
      'tenant-1',
      { resolve: vi.fn(() => ({ can: mocks.can })) } as never,
      ACTIONS.TENANT_UPDATE,
    );

    const telemetry = mocks.info.mock.calls[0]?.[0];
    expect(Object.keys(telemetry).sort()).toEqual([
      'actionFamily',
      'decision',
      'event',
      'scopeKind',
      'stage',
    ]);
    expect(JSON.stringify(telemetry)).not.toContain('admin@example.test');
    expect(JSON.stringify(telemetry)).not.toContain('user-1');
    expect(JSON.stringify(telemetry)).not.toContain('tenant-1');
  });
});
