import { test, expect } from '@playwright/test';

test.describe('Authentication E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should display sign in and sign up buttons when signed out', async ({
    page,
  }) => {
    const signInButton = page.getByRole('button', { name: /sign in/i });
    const signUpButton = page.getByRole('button', { name: /sign up/i });

    await expect(signInButton).toBeVisible();
    await expect(signUpButton).toBeVisible();
  });
});
