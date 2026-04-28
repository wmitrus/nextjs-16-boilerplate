import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import {
  createAuthjsE2ECredentials,
  isAuthjsRuntime,
  provisionAuthjsE2EUser,
  signInAuthjsE2E,
} from './authjs-auth';

async function completeOnboarding(page: Page): Promise<void> {
  await expect(
    page.getByRole('heading', { name: /complete your profile/i }),
  ).toBeVisible();
  await page.getByLabel(/display name/i).fill('AuthJS Incomplete User');
  await page.getByLabel(/language/i).selectOption('en-US');
  await page.getByLabel(/timezone/i).selectOption('Europe/Warsaw');
  await page.getByRole('button', { name: /get started/i }).click();
}

test.describe('AuthJS Onboarding Entry', () => {
  test.skip(!isAuthjsRuntime(), 'Skipping — AUTH_PROVIDER is not authjs.');

  test('incomplete AuthJS sign-in routes to onboarding and then settles on dashboard', async ({
    page,
    request,
  }) => {
    const credentials = createAuthjsE2ECredentials('onboarding-entry');

    await provisionAuthjsE2EUser(request, credentials, {
      onboardingComplete: false,
    });

    await signInAuthjsE2E(page, credentials);

    await page.waitForURL(/\/onboarding(?:\?|$)/, { timeout: 15000 });
    await expect(page).toHaveURL(/\/onboarding(?:\?|$)/);

    await completeOnboarding(page);

    await page.waitForURL(/\/dashboard$/, { timeout: 15000 });
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(
      page.getByRole('heading', { name: /boilerplate control center/i }),
    ).toBeVisible();
  });
});
