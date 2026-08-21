import { describe, expect, it, vi, beforeEach } from 'vitest';

import '@/testing/infrastructure/logger';

const mocks = vi.hoisted(() => ({
  record: vi.fn().mockResolvedValue(undefined),
  resolve: vi.fn(),
}));

vi.mock('@/core/runtime/bootstrap', () => ({
  getAppContainer: () => ({ resolve: mocks.resolve }),
}));

import { recordAdminAuditEvent } from './record-admin-audit-event';

import { mockChildLogger, resetAllInfrastructureMocks } from '@/testing';

describe('recordAdminAuditEvent', () => {
  beforeEach(() => {
    resetAllInfrastructureMocks();
    mocks.record.mockClear();
    mocks.resolve.mockImplementation(() => {
      throw new Error('Service not found for key: Symbol(AuditLogService)');
    });
  });

  it('calls AuditLogService.record with the given event when the service is available', async () => {
    mocks.resolve.mockReturnValue({ record: mocks.record });

    await recordAdminAuditEvent({
      category: 'organization',
      action: 'organization.update_status',
      outcome: 'success',
      tenantId: 'tenant_1',
      actorUserId: 'user_1',
      targetType: 'organization',
      targetId: 'org_1',
    });

    expect(mocks.record).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'organization',
        action: 'organization.update_status',
        outcome: 'success',
        targetType: 'organization',
        targetId: 'org_1',
      }),
    );
  });

  it('does not throw and logs a warning when the AuditLogService cannot be resolved', async () => {
    await expect(
      recordAdminAuditEvent({
        category: 'organization',
        action: 'organization.update_status',
        outcome: 'success',
      }),
    ).resolves.toBeUndefined();

    expect(mockChildLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'admin-audit-event:db-write-unavailable',
        category: 'organization',
        action: 'organization.update_status',
      }),
      expect.any(String),
    );
  });

  it('does not throw when record() itself rejects', async () => {
    mocks.resolve.mockReturnValue({
      record: vi.fn().mockRejectedValue(new Error('DB unavailable')),
    });

    await expect(
      recordAdminAuditEvent({
        category: 'waitlist',
        action: 'waitlist.approve',
        outcome: 'success',
      }),
    ).resolves.toBeUndefined();
  });
});
