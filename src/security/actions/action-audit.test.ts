import '@/testing/infrastructure/logger';

import { describe, it, expect, beforeEach, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  record: vi.fn().mockResolvedValue(undefined),
  resolve: vi.fn(),
}));

vi.mock('@/core/runtime/bootstrap', () => ({
  getAppContainer: () => ({ resolve: mocks.resolve }),
}));

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
    mocks.record.mockClear();
    // Default: no AuditLogService registered, matching the global test
    // double for getAppContainer() in tests/setup.tsx -- resolution throws,
    // and logActionAudit must swallow that (see the 'AuditLogService wiring'
    // block below for the case where it *is* registered).
    mocks.resolve.mockImplementation(() => {
      throw new Error('Service not found for key: Symbol(AuditLogService)');
    });
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

  describe('AuditLogService wiring (Phase 2)', () => {
    it('records a success event with the server_action category and no error thrown', async () => {
      mocks.resolve.mockReturnValue({ record: mocks.record });

      await logActionAudit({
        actionName: 'testAction',
        input: { data: 'test' },
        result: 'success',
        context: mockCtx,
      });

      expect(mocks.record).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'server_action',
          action: 'testAction',
          outcome: 'success',
          tenantId: 'tenant_1',
          actorUserId: 'user_1',
          ip: '1.2.3.4',
          correlationId: 'c1',
          requestId: 'r1',
        }),
      );
    });

    it('records a failure event with the redacted input as metadata', async () => {
      mocks.resolve.mockReturnValue({ record: mocks.record });

      await logActionAudit({
        actionName: 'testAction',
        input: { password: 'secret', name: 'Ada' },
        result: 'failure',
        error: 'validation failed',
        context: mockCtx,
      });

      expect(mocks.record).toHaveBeenCalledWith(
        expect.objectContaining({
          outcome: 'failure',
          metadata: { password: '[REDACTED]', name: 'Ada' },
        }),
      );
    });

    it('still logs the Pino audit entry and does not throw when the AuditLogService cannot be resolved', async () => {
      // beforeEach's default mocks.resolve already throws -- exercise it
      // explicitly here to document the contract.
      await expect(
        logActionAudit({
          actionName: 'testAction',
          input: { data: 'test' },
          result: 'success',
          context: mockCtx,
        }),
      ).resolves.toBeUndefined();

      expect(mockChildLogger.debug).toHaveBeenCalled();
      expect(mockChildLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'action-audit:db-write-unavailable',
          actionName: 'testAction',
        }),
        expect.any(String),
      );
    });

    it('does not throw when record() itself rejects', async () => {
      mocks.resolve.mockReturnValue({
        record: vi.fn().mockRejectedValue(new Error('DB unavailable')),
      });

      await expect(
        logActionAudit({
          actionName: 'testAction',
          input: { data: 'test' },
          result: 'success',
          context: mockCtx,
        }),
      ).resolves.toBeUndefined();
    });
  });
});
