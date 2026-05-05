import { test, expect } from '@playwright/test';

import {
  createAuthjsE2ECredentials,
  isAuthjsRuntime,
  provisionAuthjsE2EUser,
  signInAuthjsE2E,
} from './authjs-auth';

const isAuthjs = isAuthjsRuntime();

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

  test.describe('authenticated admin (AuthJS)', () => {
    test.skip(
      !isAuthjs,
      'Set AUTH_PROVIDER=authjs for authenticated admin E2E tests.',
    );

    test.beforeEach(async ({ page, request }) => {
      const authjsAdminUsersCredentials =
        createAuthjsE2ECredentials('admin-users-page');
      await provisionAuthjsE2EUser(request, authjsAdminUsersCredentials);
      await signInAuthjsE2E(page, authjsAdminUsersCredentials);

      await page.route('**/api/admin/users**', async (route) => {
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

      await page.goto('/admin/users');
    });

    test('page loads without error boundary', async ({ page }) => {
      await expect(
        page.getByRole('heading', { name: /user management/i }),
      ).toBeVisible();
      await expect(page.getByText(/something went wrong/i)).not.toBeVisible();
    });

    test('page has the correct title', async ({ page }) => {
      await expect(page).toHaveTitle(/Users.*Administration/i);
    });

    test('displays search input', async ({ page }) => {
      await expect(page.getByPlaceholder(/search/i)).toBeVisible();
    });

    test('displays active user in table', async ({ page }) => {
      await expect(page.getByText('alice@example.com')).toBeVisible();
      await expect(page.getByText('Alice Admin')).toBeVisible();
    });

    test('displays deactivated user in table', async ({ page }) => {
      await expect(page.getByText('bob@example.com')).toBeVisible();
    });

    test('displays the users count in the page', async ({ page }) => {
      await expect(page.getByText('2 users')).toBeVisible();
    });

    test('page has breadcrumb back to Administration hub', async ({ page }) => {
      await expect(page.getByRole('link', { name: /home/i })).toBeVisible();
      await expect(page.getByText('Administration')).toBeVisible();
    });
  });
});
