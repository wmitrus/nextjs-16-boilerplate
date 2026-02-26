import { test, expect } from '@playwright/test';

import { hasClerkE2ECredentials, signInE2E } from './clerk-auth';

test.describe('User Management E2E', () => {
  test.skip(
    !hasClerkE2ECredentials(),
    'Set E2E_CLERK_USER_USERNAME and E2E_CLERK_USER_PASSWORD for authenticated E2E tests.',
  );

  test.beforeEach(async ({ page }) => {
    await signInE2E(page);
  });

  test('should emit a browser logger entry on load', async ({ page }) => {
    await page.route('**/api/users', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'ok',
          data: [{ id: '1', name: 'E2E User 1', email: 'e2e1@example.com' }],
        }),
      });
    });

    const logPromise = page.waitForEvent('console', {
      predicate: async (message) => {
        const values = await Promise.all(
          message.args().map((arg) => arg.jsonValue()),
        );

        return values.some((value) => {
          if (typeof value === 'string') {
            return value.includes('Fetching users list');
          }

          if (value && typeof value === 'object') {
            return (
              (value as Record<string, unknown>).msg === 'Fetching users list'
            );
          }

          return false;
        });
      },
    });

    await page.goto('/users');

    await logPromise;
  });

  test('should display the user list', async ({ page }) => {
    // Mock the API response
    await page.route('**/api/users', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'ok',
          data: [
            { id: '1', name: 'E2E User 1', email: 'e2e1@example.com' },
            { id: '2', name: 'E2E User 2', email: 'e2e2@example.com' },
          ],
        }),
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

    await expect(
      page.getByRole('heading', {
        name: 'HTTP Error 500: Internal Server Error',
      }),
    ).toBeVisible();
  });

  test('shows ErrorAlert for server_error JSON payload', async ({ page }) => {
    await page.route('**/api/users', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        headers: { 'x-correlation-id': 'corr-123' },
        body: JSON.stringify({
          status: 'server_error',
          error: 'Backend failed',
          code: 'E_FAIL',
        }),
      });
    });

    await page.goto('/users');

    await expect(
      page.getByRole('heading', { name: 'Backend failed' }),
    ).toBeVisible();
    await expect(page.getByText('CODE: E_FAIL')).toBeVisible();
    await expect(page.getByText('ID: corr-123')).toBeVisible();
  });

  test('copies correlation ID to clipboard', async ({ page }) => {
    await page.addInitScript(() => {
      // @ts-expect-error - test helper
      window.__copiedText = '';
      const clipboard = {
        writeText: (text: string) => {
          // @ts-expect-error - test helper
          window.__copiedText = text;
          return Promise.resolve();
        },
      };
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        get: () => clipboard,
      });
    });

    await page.route('**/api/users', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        headers: { 'x-correlation-id': 'corr-123' },
        body: JSON.stringify({
          status: 'server_error',
          error: 'Backend failed',
          code: 'E_FAIL',
        }),
      });
    });

    await page.goto('/users');

    await expect(page.getByText('ID: corr-123')).toBeVisible();
    await page.getByTitle('Copy Correlation ID').click({ force: true });

    await expect
      .poll(async () =>
        page.evaluate(
          () =>
            // @ts-expect-error - test helper
            window.__copiedText,
        ),
      )
      .toBe('corr-123');
  });
});
