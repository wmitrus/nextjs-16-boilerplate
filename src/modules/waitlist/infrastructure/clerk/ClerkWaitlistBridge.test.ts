import { createHash } from 'node:crypto';

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/core/logger/di', async () => {
  const testing = await import('@/testing');
  return {
    resolveServerLogger: vi.fn(() => testing.mockLogger),
  };
});

import { ClerkWaitlistBridge } from './ClerkWaitlistBridge';

import { mockChildLogger, resetAllInfrastructureMocks } from '@/testing';

describe('ClerkWaitlistBridge', () => {
  beforeEach(() => {
    resetAllInfrastructureMocks();
    vi.clearAllMocks();
  });

  it('logs only a normalized email hash because Clerk waitlist is UI-managed', async () => {
    const bridge = new ClerkWaitlistBridge();

    await bridge.addToWaitlist(' Person@Example.com ');

    expect(mockChildLogger.debug).toHaveBeenCalledWith(
      {
        emailHash: createHash('sha256')
          .update('person@example.com')
          .digest('hex'),
      },
      '[ClerkWaitlistBridge] Clerk waitlist is managed via UI component — no server-side API call needed',
    );
  });
});
