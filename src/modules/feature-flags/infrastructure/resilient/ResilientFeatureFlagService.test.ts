import { describe, expect, it, vi } from 'vitest';

import type { AuthorizationContext } from '@/core/contracts/authorization';
import type { FeatureFlagService } from '@/core/contracts/feature-flags';

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

import { ResilientFeatureFlagService } from './ResilientFeatureFlagService';

const ctx: AuthorizationContext = {
  tenant: { tenantId: 'tenant-1' },
  subject: { id: 'user-1' },
  resource: { type: 'feature' },
  action: 'feature:read',
};

function makeDelegate(result: boolean | Error): FeatureFlagService {
  return {
    isEnabled: vi.fn().mockImplementation(async () => {
      if (result instanceof Error) throw result;
      return result;
    }),
  };
}

describe('ResilientFeatureFlagService', () => {
  it('returns true when delegate returns true', async () => {
    const svc = new ResilientFeatureFlagService(makeDelegate(true));
    expect(await svc.isEnabled('my-flag', ctx)).toBe(true);
  });

  it('returns false when delegate returns false', async () => {
    const svc = new ResilientFeatureFlagService(makeDelegate(false));
    expect(await svc.isEnabled('my-flag', ctx)).toBe(false);
  });

  it('returns false when delegate throws', async () => {
    const svc = new ResilientFeatureFlagService(
      makeDelegate(new Error('DB unavailable')),
    );
    expect(await svc.isEnabled('my-flag', ctx)).toBe(false);
  });

  it('logs a warning when delegate throws', async () => {
    const svc = new ResilientFeatureFlagService(
      makeDelegate(new Error('table does not exist')),
    );

    await svc.isEnabled('failing-flag', ctx);

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'feature-flag:evaluation-error',
        flag: 'failing-flag',
      }),
      expect.stringContaining('fail-safe'),
    );
  });

  it('includes the thrown error in the warning log', async () => {
    const error = new Error('connection refused');
    const svc = new ResilientFeatureFlagService(makeDelegate(error));

    await svc.isEnabled('any-flag', ctx);

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ error }),
      expect.any(String),
    );
  });
});
