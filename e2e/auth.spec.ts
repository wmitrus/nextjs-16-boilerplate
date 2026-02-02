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

  test('should navigate to custom sign-in page', async ({ page }) => {
    await page.goto('/sign-in');
    // Clerk's SignIn component usually has a "Sign in" heading
    await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible();
  });

  test('should navigate to custom sign-up page', async ({ page }) => {
    await page.goto('/sign-up');
    // Clerk's SignUp component usually has a "Create your account" heading
    await expect(
      page.getByRole('heading', { name: /create your account/i }),
    ).toBeVisible();
  });
});
