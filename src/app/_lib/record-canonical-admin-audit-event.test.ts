import '@/testing/infrastructure/logger';

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  resolveCanonical: vi.fn(),
  recordAdminAuditEvent: vi.fn(),
}));

vi.mock('@/core/env', () => ({
  env: { AUTH_PROVIDER: 'clerk' },
}));

vi.mock('./resolve-canonical-audit-write-scope', () => ({
  resolveCanonicalAuditWriteScope: mocks.resolveCanonical,
}));

vi.mock('@/security/actions/record-admin-audit-event', () => ({
  recordAdminAuditEvent: mocks.recordAdminAuditEvent,
}));

import type { DrizzleDb } from '@/core/db/types';

import { recordCanonicalOrganizationAdminAuditEvent } from './record-canonical-admin-audit-event';

const DB = {} as DrizzleDb;
const ORG_ID = '15000000-0000-4000-8000-000000000001';
const TENANT_ID = '10000000-0000-4000-8000-000000000001';

const EVENT = {
  category: 'organization',
  action: 'organization.update_status',
  outcome: 'success' as const,
};

describe('recordCanonicalOrganizationAdminAuditEvent', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.recordAdminAuditEvent.mockResolvedValue(undefined);
  });

  it('records canonical organization ownership and preserves legacyTenantId', async () => {
    mocks.resolveCanonical.mockResolvedValue({
      outcome: 'resolved',
      writeScope: {
        kind: 'organization',
        organizationId: ORG_ID,
        tenantId: TENANT_ID,
      },
    });

    await recordCanonicalOrganizationAdminAuditEvent({
      db: DB,
      organizationCandidate: ORG_ID,
      legacyTenantId: 'legacy-value',
      event: EVENT,
    });

    expect(mocks.recordAdminAuditEvent).toHaveBeenCalledWith({
      ...EVENT,
      writeScope: {
        kind: 'organization',
        organizationId: ORG_ID,
        tenantId: TENANT_ID,
      },
      legacyTenantId: 'legacy-value',
    });
  });

  it('drops the audit event when canonical resolution fails', async () => {
    mocks.resolveCanonical.mockRejectedValue(
      new Error('canonical resolution failed'),
    );

    await expect(
      recordCanonicalOrganizationAdminAuditEvent({
        db: DB,
        organizationCandidate: ORG_ID,
        legacyTenantId: 'legacy-value',
        event: EVENT,
      }),
    ).resolves.toBeUndefined();

    expect(mocks.recordAdminAuditEvent).not.toHaveBeenCalled();
  });
});
