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

  it('should redact URLSearchParams sensitive keys on failure', async () => {
    const params = new URLSearchParams([
      ['name', 'Ada'],
      ['token', 'secret-token'],
    ]);

    await logActionAudit({
      actionName: 'testAction',
      input: params,
      result: 'failure',
      error: 'validation failed',
      context: mockCtx,
    });

    expect(mockChildLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        input: { name: 'Ada', token: '[REDACTED]' },
      }),
      expect.stringContaining('failed'),
    );
  });

  it('should redact sensitive fields inside array input on failure', async () => {
    await logActionAudit({
      actionName: 'testAction',
      input: [{ password: 'secret' }, { name: 'Ada' }],
      result: 'failure',
      error: 'batch failed',
      context: mockCtx,
    });

    expect(mockChildLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        input: [{ password: '[REDACTED]' }, { name: 'Ada' }],
      }),
      expect.stringContaining('failed'),
    );
  });

  it('should handle non-object non-array input values on failure', async () => {
    await logActionAudit({
      actionName: 'testAction',
      input: { fn: () => 'result' },
      result: 'failure',
      error: 'handler error',
      context: mockCtx,
    });

    expect(mockChildLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          fn: expect.any(String),
        }),
      }),
      expect.stringContaining('failed'),
    );
  });

  it('should handle circular reference input on failure', async () => {
    const circular: Record<string, unknown> = { name: 'Ada' };
    circular['self'] = circular;

    await logActionAudit({
      actionName: 'testAction',
      input: circular,
      result: 'failure',
      error: 'circular error',
      context: mockCtx,
    });

    expect(mockChildLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          name: 'Ada',
          self: '[Circular]',
        }),
      }),
      expect.stringContaining('failed'),
    );
  });
});
