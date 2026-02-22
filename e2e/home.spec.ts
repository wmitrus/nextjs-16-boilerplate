import { test, expect } from '@playwright/test';

test.describe('Home Page E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should display the correct title', async ({ page }) => {
    await expect(page).toHaveTitle(
      /Next\.js 16 Boilerplate \| Build Your Next Idea Faster/i,
    );
  });

  test('should have a link to documentation', async ({ page }) => {
    const docsLink = page.getByRole('link', { name: /documentation/i });
    await expect(docsLink).toBeVisible();
    await expect(docsLink).toHaveAttribute('href', '/docs');
  });

  test('should have the "Get Started" link', async ({ page }) => {
    const getStartedLinks = page.getByRole('link', { name: /get started/i });
    await expect(getStartedLinks).toHaveCount(2);
    await expect(getStartedLinks.first()).toHaveAttribute('href', '/sign-up');
    await expect(getStartedLinks.nth(1)).toHaveAttribute('href', '/sign-up');
  });
});
