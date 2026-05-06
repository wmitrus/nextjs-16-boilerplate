import { test, expect } from '@playwright/test';

import {
  createAuthjsE2ECredentials,
  isAuthjsRuntime,
  provisionAuthjsE2EUser,
  signInAuthjsE2E,
} from './authjs-auth';

const isAuthjs = isAuthjsRuntime();

test.describe('Admin Hub (/admin)', () => {
  test('redirects unauthenticated users away from /admin', async ({ page }) => {
    await page.goto('/admin');
    await expect(page).not.toHaveURL(/\/admin($|\/)/);
  });

  test('redirects unauthenticated users away from /admin/waitlist', async ({
    page,
  }) => {
    await page.goto('/admin/waitlist');
    await expect(page).not.toHaveURL(/\/admin\/waitlist/);
  });

  test('redirects unauthenticated users away from /admin/invitations', async ({
    page,
  }) => {
    await page.goto('/admin/invitations');
    await expect(page).not.toHaveURL(/\/admin\/invitations/);
  });

  test.describe('authenticated admin (AuthJS)', () => {
    test.skip(
      !isAuthjs,
      'Set AUTH_PROVIDER=authjs for authenticated admin E2E tests.',
    );

    test.beforeEach(async ({ page, request }) => {
      const authjsAdminCredentials = createAuthjsE2ECredentials('admin-hub');
      await provisionAuthjsE2EUser(request, authjsAdminCredentials);
      await signInAuthjsE2E(page, authjsAdminCredentials);
    });

    test('admin hub loads without error boundary', async ({ page }) => {
      await page.goto('/admin');
      await expect(
        page.getByRole('heading', { name: /administration/i }),
      ).toBeVisible();
      await expect(page.getByText(/something went wrong/i)).not.toBeVisible();
    });

    test('admin hub has correct page title', async ({ page }) => {
      await page.goto('/admin');
      await expect(page).toHaveTitle(/administration/i);
    });

    test('admin hub shows active section cards', async ({ page }) => {
      await page.goto('/admin');
      await expect(page.locator('a[href="/admin/waitlist"]')).toBeVisible();
      await expect(page.locator('a[href="/admin/users"]')).toBeVisible();
      await expect(page.locator('a[href="/admin/invitations"]')).toBeVisible();
    });

    test('admin hub breadcrumb shows Administration link', async ({ page }) => {
      await page.goto('/admin');
      await expect(
        page.locator('span').filter({ hasText: /^Administration$/ }),
      ).toBeVisible();
    });
  });
});

test.describe('Admin Users (/admin/users)', () => {
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
      const authjsAdminCredentials = createAuthjsE2ECredentials('admin-users');
      await provisionAuthjsE2EUser(request, authjsAdminCredentials);
      await signInAuthjsE2E(page, authjsAdminCredentials);
    });

    test('admin users page loads without error boundary', async ({ page }) => {
      await page.goto('/admin/users');
      await expect(page.getByText(/something went wrong/i)).not.toBeVisible();
      await expect(page).toHaveURL(/\/admin\/users/);
    });

    test('admin users page has correct title', async ({ page }) => {
      await page.goto('/admin/users');
      await expect(page).toHaveTitle(/users.*administration/i);
    });
  });
});

test.describe('Admin Waitlist (/admin/waitlist)', () => {
  test.describe('authenticated admin (AuthJS)', () => {
    test.skip(
      !isAuthjs,
      'Set AUTH_PROVIDER=authjs for authenticated admin E2E tests.',
    );

    test.beforeEach(async ({ page, request }) => {
      const authjsAdminCredentials =
        createAuthjsE2ECredentials('admin-waitlist');
      await provisionAuthjsE2EUser(request, authjsAdminCredentials);
      await signInAuthjsE2E(page, authjsAdminCredentials);
    });

    test('waitlist page loads without error boundary', async ({ page }) => {
      await page.goto('/admin/waitlist');
      await expect(page.getByText(/something went wrong/i)).not.toBeVisible();
      await expect(page).toHaveURL(/\/admin\/waitlist/);
    });

    test('waitlist page has correct title', async ({ page }) => {
      await page.goto('/admin/waitlist');
      await expect(page).toHaveTitle(/waitlist.*administration/i);
    });
  });
});

test.describe('Admin Invitations (/admin/invitations)', () => {
  test.describe('authenticated admin (AuthJS)', () => {
    test.skip(
      !isAuthjs,
      'Set AUTH_PROVIDER=authjs for authenticated admin E2E tests.',
    );

    test.beforeEach(async ({ page, request }) => {
      const authjsAdminCredentials =
        createAuthjsE2ECredentials('admin-invitations');
      await provisionAuthjsE2EUser(request, authjsAdminCredentials);
      await signInAuthjsE2E(page, authjsAdminCredentials);
    });

    test('invitations page loads without error boundary', async ({ page }) => {
      await page.goto('/admin/invitations');
      await expect(page.getByText(/something went wrong/i)).not.toBeVisible();
      await expect(page).toHaveURL(/\/admin\/invitations/);
    });

    test('invitations page has correct title', async ({ page }) => {
      await page.goto('/admin/invitations');
      await expect(page).toHaveTitle(/invitations.*administration/i);
    });

    test('invitations page shows send invitation form', async ({ page }) => {
      await page.goto('/admin/invitations');
      await expect(
        page.getByRole('heading', { name: 'Invitations', exact: true }),
      ).toBeVisible();
    });
  });
});
