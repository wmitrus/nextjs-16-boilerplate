import { test, expect } from '@playwright/test';

test.describe('Feature Flags Demo Page E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/feature-flags-demo');
  });

  test('should load without error boundary', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /feature flags showcase/i }),
    ).toBeVisible();

    await expect(page.getByText(/something went wrong/i)).not.toBeVisible();
  });

  test('should have the correct page title', async ({ page }) => {
    await expect(page).toHaveTitle(/Feature Flags Demo/i);
  });

  test('should show the active provider name', async ({ page }) => {
    await expect(
      page.getByText(/flags resolved server-side from the/i),
    ).toBeVisible();
  });

  test('should display at least one feature flag status card', async ({
    page,
  }) => {
    const cards = page.getByText(/demo\./);
    await expect(cards.first()).toBeVisible();
  });

  test('should show the adapter switching instructions section', async ({
    page,
  }) => {
    await expect(
      page.getByRole('heading', { name: /how to switch adapters/i }),
    ).toBeVisible();
  });
});
