import '@/testing/infrastructure/logger';

import { describe, it, expect, beforeEach } from 'vitest';

import { logActionAudit } from './action-audit';

import {
  createMockSecurityContext,
  resetAllInfrastructureMocks,
  mockChildLogger,
} from '@/testing';

describe('Action Audit', () => {
  const mockCtx = createMockSecurityContext({
    user: { id: 'user_1', tenantId: 'tenant_1' },
    ip: '1.2.3.4',
    correlationId: 'c1',
    requestId: 'r1',
  });

  beforeEach(() => {
    resetAllInfrastructureMocks();
  });

  it('should log success as debug', async () => {
    await logActionAudit({
      actionName: 'testAction',
      input: { data: 'test' },
      result: 'success',
      context: mockCtx,
    });

    expect(mockChildLogger.debug).toHaveBeenCalledWith(
      expect.objectContaining({
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

    expect(mockChildLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        result: 'failure',
        input: { data: 'test' },
      }),
      expect.stringContaining('failed'),
    );
  });
});
