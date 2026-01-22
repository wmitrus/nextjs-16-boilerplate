import { test, expect } from '@playwright/test';

test.describe('Home Page E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should display the correct title', async ({ page }) => {
    await expect(page).toHaveTitle(/Create Next App/);
  });

  test('should have a link to documentation', async ({ page }) => {
    const docsLink = page.getByRole('link', { name: /documentation/i });
    await expect(docsLink).toBeVisible();
    await expect(docsLink).toHaveAttribute('href', /nextjs.org\/docs/);
  });

  test('should have the "Deploy Now" button', async ({ page }) => {
    const deployLink = page.getByRole('link', { name: /deploy now/i });
    await expect(deployLink).toBeVisible();
    await expect(deployLink).toHaveAttribute('href', /vercel.com\/new/);
  });
});
