import { describe, expect, it, vi } from 'vitest';

import type {
  AuditEventInput,
  AuditLogService,
} from '@/core/contracts/audit-log';

const mockLogger = vi.hoisted(() => {
  const warn = vi.fn();
  const child = vi.fn();
  const instance = { warn, child };
  child.mockReturnValue(instance);
  return instance;
});

vi.mock('@/core/logger/di', () => ({
  resolveServerLogger: () => mockLogger,
}));

import { ResilientAuditLogService } from './ResilientAuditLogService';

const EVENT: AuditEventInput = {
  category: 'server_action',
  action: 'org.update',
  outcome: 'success',
};

function makeDelegate(result: 'ok' | Error): AuditLogService {
  return {
    record: vi.fn().mockImplementation(async () => {
      if (result instanceof Error) throw result;
    }),
  };
}

describe('ResilientAuditLogService', () => {
  it('does not throw when the delegate succeeds', async () => {
    const svc = new ResilientAuditLogService(makeDelegate('ok'));
    await expect(svc.record(EVENT)).resolves.toBeUndefined();
  });

  it('does not throw when the delegate rejects (fail-open)', async () => {
    const svc = new ResilientAuditLogService(
      makeDelegate(new Error('relation "audit_events" does not exist')),
    );
    await expect(svc.record(EVENT)).resolves.toBeUndefined();
  });

  it('logs a warning with sanitized errorMessage/errorName, not the raw error object', async () => {
    const svc = new ResilientAuditLogService(
      makeDelegate(new Error('connection refused')),
    );

    await svc.record(EVENT);

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'audit-log:record-error',
        category: 'server_action',
        action: 'org.update',
        errorMessage: 'connection refused',
        errorName: 'Error',
      }),
      expect.stringContaining('fail-open'),
    );
  });
});
