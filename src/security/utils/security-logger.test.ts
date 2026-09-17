import '@/testing/infrastructure/logger';

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  record: vi.fn().mockResolvedValue(undefined),
  resolve: vi.fn(),
  identityLookup: {
    findInternalOrganizationId: vi.fn(),
  },
  organizationAuthority: {
    readParentTenantId: vi.fn(),
  },
}));

vi.mock('@/core/runtime/bootstrap', () => ({
  getAppContainer: () => ({ resolve: mocks.resolve }),
}));

import { AUDIT_LOG, AUTH, AUTHORIZATION } from '@/core/contracts';

import { logSecurityEvent } from './security-logger';

import {
  createMockSecurityContext,
  resetAllInfrastructureMocks,
  mockChildLogger,
} from '@/testing';

const ORG_ID = '15000000-0000-4000-8000-000000000001';
const TENANT_ID = '10000000-0000-4000-8000-000000000001';

function installResolver(auditRecord?: typeof mocks.record): void {
  const registry = new Map<symbol, unknown>([
    [AUTH.INTERNAL_IDENTITY_LOOKUP, mocks.identityLookup],
    [AUTHORIZATION.ORGANIZATION_SCOPE_AUTHORITY, mocks.organizationAuthority],
  ]);

  if (auditRecord) {
    registry.set(AUDIT_LOG.SERVICE, { record: auditRecord });
  }

  mocks.resolve.mockImplementation((token: symbol) => {
    if (!registry.has(token)) {
      throw new Error(`Service not found for key: ${String(token)}`);
    }

    return registry.get(token);
  });
}

describe('Security Logger', () => {
  const mockCtx = createMockSecurityContext({
    user: { id: 'u1', tenantId: 't1' },
    ip: '1.1.1.1',
    correlationId: 'c1',
    requestId: 'r1',
    environment: 'test',
  });

  beforeEach(() => {
    resetAllInfrastructureMocks();
    mocks.record.mockReset().mockResolvedValue(undefined);
    mocks.identityLookup.findInternalOrganizationId
      .mockReset()
      .mockResolvedValue(ORG_ID);
    mocks.organizationAuthority.readParentTenantId
      .mockReset()
      .mockResolvedValue(TENANT_ID);
    installResolver();
  });

  it('should log security events as fatal', async () => {
    await logSecurityEvent({
      event: 'auth_failure',
      context: mockCtx,
      metadata: { reason: 'invalid token' },
    });

    expect(mockChildLogger.fatal).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'SECURITY_EVENT',
        event: 'auth_failure',
        userId: 'u1',
        reason: 'invalid token',
      }),
      expect.stringContaining('AUTH_FAILURE'),
    );
  });

  describe('AuditLogService wiring (Phase 2)', () => {
    it('records the event under the security_event category with outcome failure', async () => {
      installResolver(mocks.record);

      await logSecurityEvent({
        event: 'ssrf_attempt',
        context: mockCtx,
        metadata: { attemptedHost: 'internal.local' },
      });

      expect(mocks.record).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'security_event',
          action: 'ssrf_attempt',
          outcome: 'failure',
          writeScope: {
            kind: 'organization',
            organizationId: ORG_ID,
            tenantId: TENANT_ID,
          },
          legacyTenantId: 't1',
          actorUserId: 'u1',
          ip: '1.1.1.1',
          correlationId: 'c1',
          requestId: 'r1',
          metadata: { attemptedHost: 'internal.local' },
        }),
      );
    });

    it('redacts sensitive metadata fields before persisting', async () => {
      installResolver(mocks.record);

      await logSecurityEvent({
        event: 'tenant_violation',
        context: mockCtx,
        metadata: { attemptedTenantId: 'mismatch_123', token: 'leak-me' },
      });

      expect(mocks.record).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: {
            attemptedTenantId: 'mismatch_123',
            token: '[REDACTED]',
          },
        }),
      );
    });

    it('still logs the Pino fatal entry and does not throw when the AuditLogService cannot be resolved', async () => {
      await expect(
        logSecurityEvent({ event: 'replay_attack', context: mockCtx }),
      ).resolves.toBeUndefined();

      expect(mockChildLogger.fatal).toHaveBeenCalled();
      expect(mockChildLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'security-logger:db-write-unavailable',
          securityEvent: 'replay_attack',
        }),
        expect.any(String),
      );
    });
  });
});
