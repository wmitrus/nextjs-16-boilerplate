import { test, expect } from '@playwright/test';

import { hasClerkE2ECredentials, signInE2E } from './clerk-auth';

test.describe('Error boundary E2E', () => {
  test.skip(
    !hasClerkE2ECredentials(),
    'Set E2E_CLERK_USER_USERNAME and E2E_CLERK_USER_PASSWORD for authenticated E2E tests.',
  );

  test.beforeEach(async ({ page }) => {
    await signInE2E(page);
  });

  test('renders segment error boundary when page throws', async ({ page }) => {
    await page.goto('/e2e-error?throw=1');

    await expect(page.getByText('E2E Error Boundary')).toBeVisible();
    await expect(
      page.getByText('The page crashed as expected for tests.'),
    ).toBeVisible();
  });
});
