import {
  test as base,
  expect,
  type APIRequestContext,
  type BrowserContext,
  type Page,
} from '@playwright/test';

import {
  captureAuthjsSessionStorageState,
  createAuthjsE2ECredentials,
  isAuthjsRuntime,
  provisionAuthjsE2EUser,
} from './authjs-auth';

const isAuthjs = isAuthjsRuntime();
const baseURL = process.env.PLAYWRIGHT_TEST_BASE_URL ?? 'http://localhost:3000';
const test = base;
type SessionStorageState = Awaited<ReturnType<BrowserContext['storageState']>>;
const authTest = base.extend<
  {
    authedPage: Page;
  },
  {
    authRequest: APIRequestContext;
    adminStorageState: SessionStorageState;
  }
>({
  authRequest: [
    async ({ playwright }, runWithRequest) => {
      const request = await playwright.request.newContext({ baseURL });
      await runWithRequest(request);
      await request.dispose();
    },
    { scope: 'worker' },
  ],
  adminStorageState: [
    async ({ browser, authRequest }, runWithStorageState) => {
      const authjsAdminCredentials =
        createAuthjsE2ECredentials('admin-users-shared');
      await provisionAuthjsE2EUser(authRequest, authjsAdminCredentials);
      const storageState = await captureAuthjsSessionStorageState(
        browser,
        authjsAdminCredentials,
      );
      await runWithStorageState(storageState);
    },
    { scope: 'worker' },
  ],
  authedPage: async ({ browser, adminStorageState }, runWithPage) => {
    const context = await browser.newContext({
      storageState: adminStorageState,
    });
    const page = await context.newPage();
    await runWithPage(page);
    await context.close();
  },
});

test.describe.configure({ mode: 'serial' });

const MOCK_USERS = [
  {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    email: 'alice@example.com',
    displayName: 'Alice Admin',
    onboardingComplete: true,
    deactivatedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    email: 'bob@example.com',
    displayName: 'Bob User',
    onboardingComplete: true,
    deactivatedAt: '2026-03-01T10:00:00.000Z',
    createdAt: '2026-01-02T00:00:00.000Z',
  },
];

test.describe('Admin User Management (/admin/users)', () => {
  test('redirects unauthenticated users away from /admin/users', async ({
    page,
  }) => {
    await page.goto('/admin/users');
    await expect(page).not.toHaveURL(/\/admin\/users/);
  });

  authTest.describe('authenticated admin (AuthJS)', () => {
    authTest.skip(
      !isAuthjs,
      'Set AUTH_PROVIDER=authjs for authenticated admin E2E tests.',
    );

    authTest.beforeEach(async ({ authedPage }) => {
      await authedPage.route('**/api/admin/users**', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            status: 'ok',
            data: {
              users: MOCK_USERS,
              total: MOCK_USERS.length,
              limit: 50,
              offset: 0,
            },
          }),
        });
      });

      await authedPage.goto('/admin/users');
    });

    authTest('page loads without error boundary', async ({ authedPage }) => {
      await expect(
        authedPage.getByRole('heading', { name: /user management/i }),
      ).toBeVisible();
      await expect(
        authedPage.getByText(/something went wrong/i),
      ).not.toBeVisible();
    });

    authTest('page has the correct title', async ({ authedPage }) => {
      await expect(authedPage).toHaveTitle(/Users.*Administration/i);
    });

    authTest('displays search input', async ({ authedPage }) => {
      await expect(authedPage.getByPlaceholder(/search/i)).toBeVisible();
    });

    authTest('displays active user in table', async ({ authedPage }) => {
      await expect(authedPage.getByText('alice@example.com')).toBeVisible();
      await expect(authedPage.getByText('Alice Admin')).toBeVisible();
    });

    authTest('displays deactivated user in table', async ({ authedPage }) => {
      await expect(authedPage.getByText('bob@example.com')).toBeVisible();
    });

    authTest('displays the users count in the page', async ({ authedPage }) => {
      await expect(authedPage.getByText('2 users')).toBeVisible();
    });

    authTest(
      'page has breadcrumb back to Administration hub',
      async ({ authedPage }) => {
        await expect(
          authedPage.getByRole('link', { name: /home/i }),
        ).toBeVisible();
        await expect(authedPage.getByText('Administration')).toBeVisible();
      },
    );
  });
});
