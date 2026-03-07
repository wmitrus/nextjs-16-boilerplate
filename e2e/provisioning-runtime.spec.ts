import { test, expect } from '@playwright/test';

import {
  hasClerkE2ECredentials,
  hasClerkUnprovisionedE2ECredentials,
  signInE2E,
  signInUnprovisionedE2E,
} from './clerk-auth';

test.describe('Provisioning Runtime E2E', () => {
  test('returns provisioning snapshot for authenticated provisioned user', async ({
    page,
  }) => {
    test.skip(
      !hasClerkE2ECredentials(),
      'Set E2E_CLERK_USER_USERNAME and E2E_CLERK_USER_PASSWORD.',
    );

    await signInE2E(page);

    const response = await page.request.get('/api/me/provisioning-status');
    expect([200, 403, 409]).toContain(response.status());

    const body = await response.json();
    expect(body.status).toMatch(/ok|server_error/);
  });

  test('active external session without internal provisioning is forced to onboarding', async ({
    page,
  }) => {
    test.skip(
      !hasClerkUnprovisionedE2ECredentials(),
      'Set E2E_CLERK_UNPROVISIONED_USER_USERNAME and E2E_CLERK_UNPROVISIONED_USER_PASSWORD for this scenario.',
    );

    await signInUnprovisionedE2E(page);

    const probe = await page.request.get('/api/me/provisioning-status');
    expect(probe.status()).toBe(409);

    const probeBody = await probe.json();
    expect(probeBody.code).toBe('ONBOARDING_REQUIRED');

    await page.goto('/users');
    await expect(page).toHaveURL(/\/onboarding/);
  });
});
