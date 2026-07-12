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
const baseURL = process.env.PLAYWRIGHT_TEST_BASE_URL ?? 'http://localhost:3100';
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
      const authjsAdminCredentials = createAuthjsE2ECredentials('admin-shared');
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

  authTest.describe('authenticated admin (AuthJS)', () => {
    authTest.skip(
      !isAuthjs,
      'Set AUTH_PROVIDER=authjs for authenticated admin E2E tests.',
    );

    authTest(
      'admin hub loads without error boundary',
      async ({ authedPage }) => {
        await authedPage.goto('/admin');
        await expect(
          authedPage.getByRole('heading', { name: /administration/i }),
        ).toBeVisible();
        await expect(
          authedPage.getByText(/something went wrong/i),
        ).not.toBeVisible();
      },
    );

    authTest('admin hub has correct page title', async ({ authedPage }) => {
      await authedPage.goto('/admin');
      await expect(authedPage).toHaveTitle(/administration/i);
    });

    authTest('admin hub shows active section cards', async ({ authedPage }) => {
      await authedPage.goto('/admin');
      await expect(
        authedPage.getByRole('link', { name: /waitlist/i }),
      ).toBeVisible();
      await expect(
        authedPage.getByRole('link', {
          name: /users browse, search, and manage/i,
        }),
      ).toBeVisible();
      await expect(
        authedPage.getByRole('link', { name: /organizations manage/i }),
      ).toBeVisible();
      await expect(
        authedPage.getByRole('link', { name: /roles define and manage/i }),
      ).toBeVisible();
      await expect(
        authedPage.getByRole('link', {
          name: /rbac & policies review and manage/i,
        }),
      ).toBeVisible();
    });

    authTest(
      'admin hub routes roles and rbac through organizations while invitations keep their own entry',
      async ({ authedPage }) => {
        await authedPage.goto('/admin');

        await expect(
          authedPage.getByRole('link', { name: /organizations manage/i }),
        ).toBeVisible();
        await expect(
          authedPage.getByRole('link', { name: /roles define and manage/i }),
        ).toBeVisible();
        await expect(
          authedPage.getByRole('link', {
            name: /rbac & policies review and manage/i,
          }),
        ).toBeVisible();
        await expect(
          authedPage.getByRole('link', {
            name: /invitations send direct invitations to users/i,
          }),
        ).toBeVisible();
      },
    );

    authTest(
      'admin hub breadcrumb shows Administration link',
      async ({ authedPage }) => {
        await authedPage.goto('/admin');
        await expect(
          authedPage.locator('span').filter({ hasText: /^Administration$/ }),
        ).toBeVisible();
      },
    );
  });
});

test.describe('Admin Users (/admin/users)', () => {
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

    authTest(
      'admin users page loads without error boundary',
      async ({ authedPage }) => {
        await authedPage.goto('/admin/users');
        await expect(
          authedPage.getByText(/something went wrong/i),
        ).not.toBeVisible();
        await expect(authedPage).toHaveURL(/\/admin\/users/);
      },
    );

    authTest('admin users page has correct title', async ({ authedPage }) => {
      await authedPage.goto('/admin/users');
      await expect(authedPage).toHaveTitle(/users.*administration/i);
    });
  });
});

test.describe('Admin Waitlist (/admin/waitlist)', () => {
  authTest.describe('authenticated admin (AuthJS)', () => {
    authTest.skip(
      !isAuthjs,
      'Set AUTH_PROVIDER=authjs for authenticated admin E2E tests.',
    );

    authTest(
      'waitlist page loads without error boundary',
      async ({ authedPage }) => {
        await authedPage.goto('/admin/waitlist');
        await expect(
          authedPage.getByText(/something went wrong/i),
        ).not.toBeVisible();
        await expect(authedPage).toHaveURL(/\/admin\/waitlist/);
      },
    );

    authTest('waitlist page has correct title', async ({ authedPage }) => {
      await authedPage.goto('/admin/waitlist');
      await expect(authedPage).toHaveTitle(/waitlist.*administration/i);
    });
  });
});

test.describe('Admin Invitations (/admin/invitations)', () => {
  authTest.describe('authenticated admin (AuthJS)', () => {
    authTest.skip(
      !isAuthjs,
      'Set AUTH_PROVIDER=authjs for authenticated admin E2E tests.',
    );

    authTest(
      'invitations page loads without error boundary',
      async ({ authedPage }) => {
        await authedPage.goto('/admin/invitations');
        await expect(
          authedPage.getByText(/something went wrong/i),
        ).not.toBeVisible();
        await expect(authedPage).toHaveURL(/\/admin\/invitations/);
      },
    );

    authTest('invitations page has correct title', async ({ authedPage }) => {
      await authedPage.goto('/admin/invitations');
      await expect(authedPage).toHaveTitle(/invitations.*administration/i);
    });

    authTest(
      'invitations page shows organization selection hub',
      async ({ authedPage }) => {
        await authedPage.goto('/admin/invitations');
        await expect(
          authedPage.getByText(
            /choose an organization before sending direct invitations/i,
          ),
        ).toBeVisible();
        await expect(
          authedPage.getByRole('link', { name: /open invitations/i }).first(),
        ).toBeVisible();
      },
    );
  });
});

test.describe('Admin Organizations (/admin/organizations)', () => {
  authTest.describe('authenticated admin (AuthJS)', () => {
    authTest.skip(
      !isAuthjs,
      'Set AUTH_PROVIDER=authjs for authenticated admin E2E tests.',
    );

    authTest(
      'organization archive and restore changes detail and list state',
      async ({ authedPage }) => {
        await authedPage.goto('/admin/organizations');

        const organizationCard = authedPage
          .locator('section')
          .filter({
            has: authedPage.getByRole('link', { name: /view details/i }),
          })
          .first();

        await expect(organizationCard).toContainText(/active|available/i);
        await organizationCard
          .getByRole('link', { name: /view details/i })
          .click();

        await expect(authedPage).toHaveURL(/\/admin\/organizations\//);
        await expect(
          authedPage.getByRole('button', { name: /archive organization/i }),
        ).toBeVisible();

        await authedPage
          .getByRole('button', { name: /archive organization/i })
          .click();

        await expect(
          authedPage.getByText(/this organization is archived/i),
        ).toBeVisible();
        await expect(
          authedPage.getByRole('button', { name: /restore organization/i }),
        ).toBeVisible();
        await expect(
          authedPage.getByRole('button', { name: /archive organization/i }),
        ).toHaveCount(0);

        await authedPage.getByRole('link', { name: /organizations/i }).click();
        await expect(authedPage).toHaveURL(/\/admin\/organizations$/);

        await authedPage
          .getByRole('button', { name: /^archived\s+\d+$/i })
          .click();

        const archivedCard = authedPage
          .locator('section')
          .filter({
            has: authedPage.getByRole('link', { name: /view details/i }),
          })
          .first();

        await expect(archivedCard).toContainText(/archived/i);
        await expect(
          archivedCard.getByRole('button', {
            name: /restore before activating/i,
          }),
        ).toBeDisabled();

        await archivedCard.getByRole('link', { name: /view details/i }).click();
        await expect(
          authedPage.getByRole('button', { name: /restore organization/i }),
        ).toBeVisible();

        await authedPage
          .getByRole('button', { name: /restore organization/i })
          .click();

        await expect(
          authedPage.getByRole('button', { name: /archive organization/i }),
        ).toBeVisible();
        await expect(
          authedPage.getByText(/this organization is archived/i),
        ).toHaveCount(0);
      },
    );
  });
});
