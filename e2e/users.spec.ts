import { test, expect } from '@playwright/test';

test.describe('User Management E2E', () => {
  test('should display the user list', async ({ page }) => {
    // Mock the API response
    await page.route('**/api/users', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: '1', name: 'E2E User 1', email: 'e2e1@example.com' },
          { id: '2', name: 'E2E User 2', email: 'e2e2@example.com' },
        ]),
      });
    });

    await page.goto('/users');

    await expect(page.getByText('User Management')).toBeVisible();

    // Verify the mock data is displayed
    await expect(page.getByText('E2E User 1')).toBeVisible();
    await expect(page.getByText('e2e1@example.com')).toBeVisible();
    await expect(page.getByText('E2E User 2')).toBeVisible();
    await expect(page.getByText('e2e2@example.com')).toBeVisible();
  });

  test('should display error message on API failure', async ({ page }) => {
    // Mock the API failure
    await page.route('**/api/users', async (route) => {
      await route.fulfill({
        status: 500,
      });
    });

    await page.goto('/users');

    await expect(page.getByText('Failed to fetch users')).toBeVisible();
  });
});
