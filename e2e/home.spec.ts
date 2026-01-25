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

  test('should emit a browser logger entry', async ({ page }) => {
    const logPromise = page.waitForEvent('console', {
      predicate: async (message) => {
        const values = await Promise.all(
          message.args().map((arg) => arg.jsonValue()),
        );

        return values.some(
          (value) =>
            value &&
            typeof value === 'object' &&
            'e2e' in (value as Record<string, unknown>),
        );
      },
    });

    await page.getByTestId('browser-logger-button').click();

    const message = await logPromise;
    const values = await Promise.all(
      message.args().map((arg) => arg.jsonValue()),
    );

    const payload = values.find(
      (value) =>
        value &&
        typeof value === 'object' &&
        'e2e' in (value as Record<string, unknown>),
    ) as Record<string, unknown> | undefined;

    expect(payload?.e2e).toBe(true);
    expect(payload?.count).toBe(1);
  });
});
