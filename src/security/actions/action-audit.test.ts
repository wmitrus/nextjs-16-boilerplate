import '@/testing/infrastructure/logger';

import { describe, it, expect, beforeEach } from 'vitest';

import { logger } from '@/core/logger/server';

import { logActionAudit } from './action-audit';

import {
  createMockSecurityContext,
  resetAllInfrastructureMocks,
} from '@/testing';

describe('Action Audit', () => {
  const mockCtx = createMockSecurityContext({
    user: { id: 'user_1', role: 'user', tenantId: 'tenant_1' },
    ip: '1.2.3.4',
    correlationId: 'c1',
    requestId: 'r1',
  });

  beforeEach(() => {
    resetAllInfrastructureMocks();
  });

  it('should log success as info', async () => {
    await logActionAudit({
      actionName: 'testAction',
      input: { data: 'test' },
      result: 'success',
      context: mockCtx,
    });

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'SECURITY_AUDIT',
        actionName: 'testAction',
        result: 'success',
      }),
      expect.stringContaining('successful'),
    );
  });

  it('should log failure as error and include input', async () => {
    await logActionAudit({
      actionName: 'testAction',
      input: { data: 'test' },
      result: 'failure',
      error: 'validation failed',
      context: mockCtx,
    });

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'SECURITY_AUDIT',
        result: 'failure',
        input: { data: 'test' },
      }),
      expect.stringContaining('failed'),
    );
  });
});
