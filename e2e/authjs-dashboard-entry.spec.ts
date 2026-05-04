import { test, expect } from '@playwright/test';

import {
  isAuthjsRuntime,
  provisionAuthjsE2EUser,
  signInAuthjsE2E,
  type AuthjsE2ECredentials,
} from './authjs-auth';

const SIGN_UP_PASSWORD = 'E2E-Password-123!';

function createUniqueAuthjsTestEmail(prefix: string): string {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return `e2e+authjs-${prefix}-${suffix}@example.com`;
}

test.describe('AuthJS Dashboard Entry', () => {
  test.skip(!isAuthjsRuntime(), 'Skipping — AUTH_PROVIDER is not authjs.');

  test('unauthenticated dashboard visit redirects to AuthJS sign-in', async ({
    page,
  }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/auth\/signin/);
  });

  test('successful AuthJS sign-in lands on the dashboard by default', async ({
    page,
    request,
  }) => {
    const credentials: AuthjsE2ECredentials = {
      email: createUniqueAuthjsTestEmail('dashboard-entry'),
      password: SIGN_UP_PASSWORD,
    };

    await provisionAuthjsE2EUser(request, credentials);
    await signInAuthjsE2E(page, credentials);

    await page.waitForURL(/\/dashboard$/, { timeout: 15000 });
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(
      page.getByRole('heading', { name: /boilerplate control center/i }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /integrated tool inventory/i }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: /open sentry/i }),
    ).toBeVisible();
  });
});
