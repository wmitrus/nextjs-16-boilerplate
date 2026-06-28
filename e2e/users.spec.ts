import {
  test as base,
  expect,
  type BrowserContext,
  type Page,
} from '@playwright/test';

import {
  captureClerkSessionStorageState,
  hasClerkE2ECredentials,
} from './clerk-auth';

const test = base;
type SessionStorageState = Awaited<ReturnType<BrowserContext['storageState']>>;
const authedTest = base.extend<
  {
    authedPage: Page;
  },
  {
    userStorageState: SessionStorageState;
  }
>({
  userStorageState: [
    async ({ browser }, runWithStorageState) => {
      const storageState = await captureClerkSessionStorageState(browser);
      await runWithStorageState(storageState);
    },
    { scope: 'worker' },
  ],
  authedPage: async ({ browser, userStorageState }, runWithPage) => {
    const context = await browser.newContext({
      storageState: userStorageState,
    });
    const page = await context.newPage();
    await runWithPage(page);
    await context.close();
  },
});

test.describe('User Management E2E', () => {
  test.skip(
    !hasClerkE2ECredentials(),
    'Set E2E_CLERK_USER_USERNAME and E2E_CLERK_USER_PASSWORD for authenticated E2E tests.',
  );

  test.describe.configure({ mode: 'serial' });

  authedTest(
    'should emit a browser logger entry on load',
    async ({ authedPage }) => {
      await authedPage.route('**/api/users', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            status: 'ok',
            data: [{ id: '1', name: 'E2E User 1', email: 'e2e1@example.com' }],
          }),
        });
      });

      const seenConsoleTexts: string[] = [];
      authedPage.on('console', (message) => {
        seenConsoleTexts.push(message.text());
      });

      await authedPage.goto('/users');

      await expect
        .poll(
          () =>
            seenConsoleTexts.some(
              (text) =>
                text.includes('Fetching users list') ||
                text.includes('[object Object]'),
            ),
          { timeout: 10_000 },
        )
        .toBe(true);
    },
  );

  authedTest('should display the user list', async ({ authedPage }) => {
    await authedPage.route('**/api/users', async (route) => {
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

    await authedPage.goto('/users');

    await expect(authedPage.getByText('User Management')).toBeVisible();

    await expect(authedPage.getByText('E2E User 1')).toBeVisible();
    await expect(authedPage.getByText('e2e1@example.com')).toBeVisible();
    await expect(authedPage.getByText('E2E User 2')).toBeVisible();
    await expect(authedPage.getByText('e2e2@example.com')).toBeVisible();
  });

  authedTest(
    'should display error message on API failure',
    async ({ authedPage }) => {
      await authedPage.route('**/api/users', async (route) => {
        await route.fulfill({
          status: 500,
        });
      });

      await authedPage.goto('/users');

      await expect(
        authedPage.getByRole('heading', {
          name: 'HTTP Error 500: Internal Server Error',
        }),
      ).toBeVisible();
    },
  );

  authedTest(
    'shows ErrorAlert for server_error JSON payload',
    async ({ authedPage }) => {
      await authedPage.route('**/api/users', async (route) => {
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

      await authedPage.goto('/users');

      await expect(
        authedPage.getByRole('heading', { name: 'Backend failed' }),
      ).toBeVisible();
      await expect(authedPage.getByText('CODE: E_FAIL')).toBeVisible();
      await expect(authedPage.getByText('ID: corr-123')).toBeVisible();
    },
  );

  authedTest('copies correlation ID to clipboard', async ({ authedPage }) => {
    await authedPage.addInitScript(() => {
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

    await authedPage.route('**/api/users', async (route) => {
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

    await authedPage.goto('/users');

    await expect(authedPage.getByText('ID: corr-123')).toBeVisible();
    await authedPage.getByTitle('Copy Correlation ID').click({ force: true });

    await expect
      .poll(async () =>
        authedPage.evaluate(
          () =>
            // @ts-expect-error - test helper
            window.__copiedText,
        ),
      )
      .toBe('corr-123');
  });
});
