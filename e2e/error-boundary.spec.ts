import { test, expect } from '@playwright/test';

test.describe('Error boundary E2E', () => {
  test('renders segment error boundary when page throws', async ({ page }) => {
    await page.goto('/e2e-error?throw=1');

    await expect(page.getByText('E2E Error Boundary')).toBeVisible();
    await expect(
      page.getByText('The page crashed as expected for tests.'),
    ).toBeVisible();
  });
});
