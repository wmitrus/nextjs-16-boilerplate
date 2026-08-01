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

    authTest(
      'canonical nested invitations page sends and revokes a pending invitation',
      async ({ authedPage }) => {
        await authedPage.goto('/admin/invitations');

        await authedPage
          .getByRole('link', { name: /open invitations/i })
          .first()
          .click();

        await expect(authedPage).toHaveURL(
          /\/admin\/organizations\/[^/]+\/invitations$/,
        );
        await expect(
          authedPage.getByRole('heading', { name: /invitations$/i }),
        ).toBeVisible();

        const inviteEmail = `e2e+invite-${Date.now().toString()}@example.com`;

        const createInvitationResponsePromise = authedPage.waitForResponse(
          (response) => {
            return (
              response.request().method() === 'POST' &&
              /\/api\/admin\/organizations\/[^/]+\/invitations$/.test(
                response.url(),
              )
            );
          },
        );

        await authedPage.getByLabel('Email address').fill(inviteEmail);
        await authedPage
          .getByRole('button', { name: /send invitation/i })
          .click();

        const createInvitationResponse = await createInvitationResponsePromise;
        expect(createInvitationResponse.status()).toBe(201);
        await expect(
          authedPage.getByText(`Invitation sent to ${inviteEmail}`),
        ).toBeVisible();

        const invitationRow = authedPage
          .locator('div.flex.items-center.justify-between')
          .filter({ has: authedPage.getByText(inviteEmail, { exact: true }) });

        await expect(invitationRow.getByText(/pending/i)).toBeVisible();

        const revokeInvitationResponsePromise = authedPage.waitForResponse(
          (response) => {
            return (
              response.request().method() === 'DELETE' &&
              /\/api\/admin\/organizations\/[^/]+\/invitations\/[^/]+$/.test(
                response.url(),
              )
            );
          },
        );

        await invitationRow.getByRole('button', { name: /revoke/i }).click();

        const revokeInvitationResponse = await revokeInvitationResponsePromise;
        expect(revokeInvitationResponse.status()).toBe(200);
        await expect(invitationRow.getByText(/revoked/i)).toBeVisible();
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

    authTest(
      'organization members page reassigns a non-owner member role and can restore it',
      async ({ authedPage }) => {
        await authedPage.goto('/admin/organizations');

        const organizationCard = authedPage
          .locator('section')
          .filter({
            has: authedPage.getByRole('link', { name: /view details/i }),
          })
          .first();

        await organizationCard
          .getByRole('link', { name: /view details/i })
          .click();

        await authedPage.getByRole('link', { name: /manage roles/i }).click();

        const customRoleName = `billing_manager_${Date.now().toString()}`;

        const createRoleResponsePromise = authedPage.waitForResponse(
          (response) => {
            return (
              response.request().method() === 'POST' &&
              response.url().includes('/api/admin/organizations/') &&
              response.url().includes('/roles')
            );
          },
        );

        await authedPage
          .getByPlaceholder('e.g. billing_manager')
          .fill(customRoleName);
        await authedPage.getByRole('button', { name: /create role/i }).click();

        const createRoleResponse = await createRoleResponsePromise;
        const createRoleJson = (await createRoleResponse.json()) as {
          data?: {
            role?: {
              id?: string;
            };
          };
        };
        const customRoleId = createRoleJson.data?.role?.id;

        if (!customRoleId) {
          throw new Error('Create role response did not include role.id');
        }

        expect(customRoleId).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
        );

        await expect(
          authedPage.getByText(`Role created: ${customRoleName}`),
        ).toBeVisible();

        await authedPage.goto(authedPage.url().replace(/\/roles$/, '/members'));

        await expect(authedPage).toHaveURL(/\/members$/);
        await expect(
          authedPage.getByRole('heading', { name: /members$/i }),
        ).toBeVisible();

        const bobRow = authedPage.locator('tr').filter({
          has: authedPage.getByText('bob@example.com'),
        });
        const bobRoleCell = bobRow.locator('td').nth(1);
        const bobRoleSelect = bobRow.getByLabel(/role for bob@example.com/i);

        await expect(
          bobRoleCell.getByText(/^Current role: member$/),
        ).toBeVisible();

        const memberRoleId = await bobRoleSelect.inputValue();

        if (!memberRoleId) {
          throw new Error('Member role option not found for Bob');
        }

        await bobRoleSelect.selectOption(customRoleId);
        const updateMemberResponsePromise = authedPage.waitForResponse(
          (response) => {
            return (
              response.request().method() === 'PATCH' &&
              /\/api\/admin\/organizations\/[^/]+\/members\/[^/]+$/.test(
                response.url(),
              )
            );
          },
        );
        await bobRow.getByRole('button', { name: /save role/i }).click();
        const updateMemberResponse = await updateMemberResponsePromise;
        const updateMemberPayload = updateMemberResponse
          .request()
          .postDataJSON() as { roleId?: string };

        expect(updateMemberPayload.roleId).toBe(customRoleId);
        expect(updateMemberResponse.status()).toBe(200);

        await expect(
          bobRoleCell.getByText(`Current role: ${customRoleName}`),
        ).toBeVisible();
        await expect(bobRow.getByText(/^saved$/i)).toBeVisible();

        await bobRoleSelect.selectOption(memberRoleId);
        await bobRow.getByRole('button', { name: /save role/i }).click();

        await expect(
          bobRoleCell.getByText(/^Current role: member$/),
        ).toBeVisible();
        await expect(bobRow.getByText(/^saved$/i)).toBeVisible();
      },
    );

    authTest(
      'archived organization members page disables role reassignment UI',
      async ({ authedPage }) => {
        await authedPage.goto('/admin/organizations');

        const organizationCard = authedPage
          .locator('section')
          .filter({
            has: authedPage.getByRole('link', { name: /view details/i }),
          })
          .first();

        await organizationCard
          .getByRole('link', { name: /view details/i })
          .click();
        await authedPage
          .getByRole('button', { name: /archive organization/i })
          .click();

        await expect(
          authedPage.getByText(/this organization is archived/i),
        ).toBeVisible();

        await authedPage.getByRole('link', { name: /manage members/i }).click();
        await expect(authedPage).toHaveURL(/\/members$/);
        await expect(
          authedPage.getByText(
            /role reassignment is disabled until the organization is restored/i,
          ),
        ).toBeVisible();

        const bobRow = authedPage.locator('tr').filter({
          has: authedPage.getByText('bob@example.com'),
        });

        await expect(
          bobRow.getByLabel(/role for bob@example.com/i),
        ).toBeDisabled();
        await expect(
          bobRow.getByRole('button', { name: /save role/i }),
        ).toBeDisabled();

        await authedPage.getByRole('link', { name: /^acme corp hq$/i }).click();
        await authedPage
          .getByRole('button', { name: /restore organization/i })
          .click();

        await expect(
          authedPage.getByRole('button', { name: /archive organization/i }),
        ).toBeVisible();
      },
    );

    authTest(
      'organization members page blocks demoting the last owner',
      async ({ authedPage }) => {
        await authedPage.goto('/admin/organizations');

        const organizationCard = authedPage
          .locator('section')
          .filter({
            has: authedPage.getByRole('link', { name: /view details/i }),
          })
          .first();

        await organizationCard
          .getByRole('link', { name: /view details/i })
          .click();
        await authedPage.getByRole('link', { name: /manage members/i }).click();

        const aliceRow = authedPage.locator('tr').filter({
          has: authedPage.getByText('alice@example.com'),
        });
        const currentAdminRow = authedPage.locator('tr').filter({
          has: authedPage.getByText(/e2e\+authjs-admin-shared-/i),
        });

        await expect(
          aliceRow.getByText(/current role:\s*owner/i),
        ).toBeVisible();
        await expect(
          currentAdminRow.getByText(/current role:\s*owner/i),
        ).toBeVisible();

        await aliceRow
          .getByLabel(/role for alice@example.com/i)
          .selectOption({ label: 'member (system)' });
        await aliceRow.getByRole('button', { name: /save role/i }).click();

        await expect(
          aliceRow.getByText(/current role:\s*member/i),
        ).toBeVisible();
        await expect(aliceRow.getByText(/^saved$/i)).toBeVisible();

        await currentAdminRow
          .getByLabel(/role for e2e\+authjs-admin-shared-.*@example.com/i)
          .selectOption({ label: 'member (system)' });
        await currentAdminRow
          .getByRole('button', { name: /save role/i })
          .click();

        await expect(
          currentAdminRow.getByText(
            /last owner membership cannot be reassigned/i,
          ),
        ).toBeVisible();
        await expect(
          currentAdminRow.getByText(/current role:\s*owner/i),
        ).toBeVisible();
      },
    );
  });
});
