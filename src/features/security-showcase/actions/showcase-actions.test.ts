/** @vitest-environment node */
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { updateSecuritySettings } from './showcase-actions';

import { createReplayToken } from '@/security/actions/replay-token';

describe('showcase-actions', () => {
  it('returns controlled auth result instead of container resolution failure', async () => {
    const result = await updateSecuritySettings({
      theme: 'dark',
      notificationsEnabled: true,
      marketingConsent: false,
      _replayToken: createReplayToken(),
    });

    expect(result.status).not.toBe('error');
    if (result.status === 'unauthorized') {
      expect(result.error).toBeTruthy();
    }
  });
});
