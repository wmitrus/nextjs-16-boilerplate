import '@/testing/infrastructure/logger';

import { describe, it, expect, beforeEach } from 'vitest';

import { ROLES } from '@/core/contracts/roles';

import { logSecurityEvent } from './security-logger';

import {
  createMockSecurityContext,
  resetAllInfrastructureMocks,
  mockChildLogger,
} from '@/testing';

describe('Security Logger', () => {
  const mockCtx = createMockSecurityContext({
    user: { id: 'u1', role: ROLES.USER, tenantId: 't1' },
    ip: '1.1.1.1',
    correlationId: 'c1',
    requestId: 'r1',
    environment: 'test',
  });

  beforeEach(() => {
    resetAllInfrastructureMocks();
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
});
