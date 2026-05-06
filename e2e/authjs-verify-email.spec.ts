import { test, expect } from '@playwright/test';

import { getRuntimeProfile } from './runtime-profile';

const profile = getRuntimeProfile();
const isAuthjsRuntime = profile.authProvider === 'authjs';

test.describe('AuthJS Email Verification Pages E2E', () => {
  test.skip(
    !isAuthjsRuntime,
    'Auth provider is not authjs — skipping authjs email verification specs',
  );

  test.describe('/auth/verify-email', () => {
    test('loads without error boundary when no token provided', async ({
      page,
    }) => {
      await page.goto('/auth/verify-email');
      await expect(page.getByText(/something went wrong/i)).not.toBeVisible();
    });

    test('shows Email Verification heading', async ({ page }) => {
      await page.goto('/auth/verify-email');
      await expect(
        page.getByRole('heading', { name: /email verification/i }),
      ).toBeVisible();
    });

    test('shows invalid token message when no token in URL', async ({
      page,
    }) => {
      await page.goto('/auth/verify-email');
      await expect(
        page.getByText(/no verification token provided/i),
      ).toBeVisible();
    });

    test('shows invalid token message for a garbage token', async ({
      page,
    }) => {
      await page.goto('/auth/verify-email?token=invalid-garbage-token');
      await expect(
        page.getByText(/invalid|expired|already been used/i),
      ).toBeVisible();
    });

    test('shows request new verification link button when token is invalid', async ({
      page,
    }) => {
      await page.goto('/auth/verify-email?token=invalid-garbage-token');
      await expect(
        page.getByRole('link', { name: /request new verification link/i }),
      ).toBeVisible();
    });
  });

  test.describe('/auth/verify-email-pending', () => {
    test('loads without error boundary', async ({ page }) => {
      await page.goto('/auth/verify-email-pending');
      await expect(page.getByText(/something went wrong/i)).not.toBeVisible();
    });

    test('shows Verify Your Email heading', async ({ page }) => {
      await page.goto('/auth/verify-email-pending');
      await expect(
        page.getByRole('heading', { name: /verify your email/i }),
      ).toBeVisible();
    });

    test('shows capability-aware message without claiming email was sent', async ({
      page,
    }) => {
      await page.goto('/auth/verify-email-pending');
      await expect(
        page.getByText(/email verification is required/i),
      ).toBeVisible();
      await expect(page.getByText(/check your inbox/i)).not.toBeVisible();
    });

    test('shows resend form with email input', async ({ page }) => {
      await page.goto('/auth/verify-email-pending');
      await expect(page.getByLabel(/email address/i)).toBeVisible();
      await expect(
        page.getByRole('button', { name: /request new verification link/i }),
      ).toBeVisible();
    });

    test('shows link to sign in page', async ({ page }) => {
      await page.goto('/auth/verify-email-pending');
      await expect(page.getByRole('link', { name: /sign in/i })).toBeVisible();
    });
  });

  test.describe('/auth/signin — verified=true banner', () => {
    test('shows verified banner when verified=true param is present', async ({
      page,
    }) => {
      await page.goto('/auth/signin?verified=true');
      await expect(
        page.getByText(/your email has been verified/i),
      ).toBeVisible();
    });

    test('does not show verified banner without verified param', async ({
      page,
    }) => {
      await page.goto('/auth/signin');
      await expect(
        page.getByText(/your email has been verified/i),
      ).not.toBeVisible();
    });
  });
});
