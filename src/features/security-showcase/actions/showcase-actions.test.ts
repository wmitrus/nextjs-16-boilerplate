/** @vitest-environment node */
import { describe, expect, it } from 'vitest';

import { updateSecuritySettings } from './showcase-actions';

describe('showcase-actions', () => {
  it('returns controlled auth result instead of container resolution failure', async () => {
    const result = await updateSecuritySettings({
      theme: 'dark',
      notificationsEnabled: true,
      marketingConsent: false,
    });

    expect(result.status).not.toBe('error');
    if (result.status === 'unauthorized') {
      expect(result.error).toBeTruthy();
    }
  });
});
