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

  it('should redact sensitive input fields on failure', async () => {
    await logActionAudit({
      actionName: 'testAction',
      input: {
        displayName: 'Ada',
        _replayToken: 'ts|nonce',
        password: 'super-secret',
        nested: {
          apiKey: 'abc123',
        },
      },
      result: 'failure',
      error: 'validation failed',
      context: mockCtx,
    });

    expect(mockChildLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        input: {
          displayName: 'Ada',
          _replayToken: '[REDACTED]',
          password: '[REDACTED]',
          nested: {
            apiKey: '[REDACTED]',
          },
        },
      }),
      expect.stringContaining('failed'),
    );
  });
});
