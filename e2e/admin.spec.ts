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
      await expect(
        authedPage.getByRole('link', {
          name: /feature flags toggle features/i,
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

test.describe('Admin Feature Flags (/admin/feature-flags)', () => {
  test('redirects unauthenticated users away from /admin/feature-flags', async ({
    page,
  }) => {
    await page.goto('/admin/feature-flags');
    await expect(page).not.toHaveURL(/\/admin\/feature-flags/);
  });

  authTest.describe('authenticated admin (AuthJS)', () => {
    authTest.skip(
      !isAuthjs,
      'Set AUTH_PROVIDER=authjs for authenticated admin E2E tests.',
    );

    authTest(
      'feature flags page loads without error boundary',
      async ({ authedPage }) => {
        await authedPage.goto('/admin/feature-flags');
        await expect(
          authedPage.getByText(/something went wrong/i),
        ).not.toBeVisible();
        await expect(authedPage).toHaveURL(/\/admin\/feature-flags/);
      },
    );

    authTest('feature flags page has correct title', async ({ authedPage }) => {
      await authedPage.goto('/admin/feature-flags');
      await expect(authedPage).toHaveTitle(/feature flags.*administration/i);
    });

    authTest(
      'feature flags page shows the active provider',
      async ({ authedPage }) => {
        await authedPage.goto('/admin/feature-flags');
        await expect(authedPage.getByText(/active provider:/i)).toBeVisible();
      },
    );
  });

  // Requires FEATURE_FLAG_PROVIDER=db in the scenario env -- mutations
  // against the feature_flags table only take effect under that provider,
  // and the admin page correctly disables Create/Edit/Delete otherwise (see
  // FeatureFlagsClient.tsx / 01 - Architecture Guard - Summary.md's binding
  // constraint #3). The default E2E scenario env does not set
  // FEATURE_FLAG_PROVIDER, so it defaults to 'static' and this whole
  // sub-suite skips rather than asserting against disabled controls.
  authTest.describe('authenticated admin (AuthJS), db provider', () => {
    authTest.skip(
      !isAuthjs,
      'Set AUTH_PROVIDER=authjs for authenticated admin E2E tests.',
    );
    authTest.skip(
      process.env['FEATURE_FLAG_PROVIDER'] !== 'db',
      'Set FEATURE_FLAG_PROVIDER=db to exercise the create/toggle/delete cycle against real mutations.',
    );

    authTest(
      'creates, toggles, and deletes a feature flag',
      async ({ authedPage }) => {
        await authedPage.goto('/admin/feature-flags');

        const flagKey = `e2e-flag-${Date.now().toString()}`;

        const createResponsePromise = authedPage.waitForResponse(
          (response) =>
            response.request().method() === 'POST' &&
            /\/api\/admin\/feature-flags$/.test(response.url()),
        );

        await authedPage.getByLabel('Key').fill(flagKey);
        await authedPage.getByRole('button', { name: 'Create flag' }).click();

        const createResponse = await createResponsePromise;
        expect(createResponse.status()).toBe(201);

        const flagRow = authedPage
          .locator('tr')
          .filter({ has: authedPage.getByText(flagKey, { exact: true }) });
        await expect(flagRow).toBeVisible();

        const toggleResponsePromise = authedPage.waitForResponse(
          (response) =>
            response.request().method() === 'PATCH' &&
            /\/api\/admin\/feature-flags\/[^/]+$/.test(response.url()),
        );
        await flagRow.getByRole('button', { name: /^(on|off)$/i }).click();
        const toggleResponse = await toggleResponsePromise;
        expect(toggleResponse.status()).toBe(200);

        await flagRow.getByRole('button', { name: 'Delete' }).click();
        const deleteResponsePromise = authedPage.waitForResponse(
          (response) =>
            response.request().method() === 'DELETE' &&
            /\/api\/admin\/feature-flags\/[^/]+$/.test(response.url()),
        );
        await flagRow.getByRole('button', { name: 'Yes' }).click();
        const deleteResponse = await deleteResponsePromise;
        expect(deleteResponse.status()).toBe(200);

        await expect(
          authedPage
            .locator('tr')
            .filter({ has: authedPage.getByText(flagKey, { exact: true }) }),
        ).toHaveCount(0);
      },
    );
  });
});

test.describe('Admin Audit Logs (/admin/security)', () => {
  test('redirects unauthenticated users away from /admin/security', async ({
    page,
  }) => {
    await page.goto('/admin/security');
    await expect(page).not.toHaveURL(/\/admin\/security/);
  });

  test('redirects unauthenticated users away from /admin/security/audit-logs', async ({
    page,
  }) => {
    await page.goto('/admin/security/audit-logs');
    await expect(page).not.toHaveURL(/\/admin\/security\/audit-logs/);
  });

  // Requires FEATURE_FLAG_PROVIDER=db (feature_flag category mutations must
  // actually persist -- see the sibling "db provider" block above) and
  // REGISTRATION_MODE=invite-only (the waitlist scenario below creates its
  // own pending entry via the public POST /api/auth/waitlist, which 400s
  // outside invite-only mode). Neither is set by the default E2E scenario
  // env -- see the pnpm e2e:admin:audit-logs script, which sets both plus
  // AUTH_PROVIDER=authjs and E2E_BACKEND_MODE=container.
  authTest.describe(
    'authenticated admin (AuthJS), db provider, audit trail',
    () => {
      authTest.skip(
        !isAuthjs,
        'Set AUTH_PROVIDER=authjs for authenticated admin E2E tests.',
      );
      authTest.skip(
        process.env['FEATURE_FLAG_PROVIDER'] !== 'db',
        'Set FEATURE_FLAG_PROVIDER=db to exercise feature_flag-category audit events against real mutations.',
      );

      authTest(
        'enables the waitlist audit category via the settings UI (feature_flag stays on by default)',
        async ({ authedPage }) => {
          await authedPage.goto('/admin/security');

          const featureFlagRow = authedPage.locator('tr').filter({
            has: authedPage.getByText('feature_flag', { exact: true }),
          });
          await expect(
            featureFlagRow.getByRole('button', { name: /^on$/i }),
          ).toBeVisible();

          const waitlistRow = authedPage.locator('tr').filter({
            has: authedPage.getByText('waitlist', { exact: true }),
          });
          await expect(
            waitlistRow.getByRole('button', { name: /^off$/i }),
          ).toBeVisible();

          const enableWaitlistResponsePromise = authedPage.waitForResponse(
            (response) =>
              response.request().method() === 'PATCH' &&
              response.url().includes('/api/admin/audit-log-settings'),
          );
          await waitlistRow.getByRole('button', { name: /^off$/i }).click();
          const enableWaitlistResponse = await enableWaitlistResponsePromise;
          expect(enableWaitlistResponse.status()).toBe(200);

          await expect(
            waitlistRow.getByRole('button', { name: /^on$/i }),
          ).toBeVisible();
        },
      );

      authTest(
        'a feature-flag create/update/delete cycle records feature_flag category audit events',
        async ({ authedPage }) => {
          await authedPage.goto('/admin/feature-flags');

          const flagKey = `e2e-audit-flag-${Date.now().toString()}`;

          const createResponsePromise = authedPage.waitForResponse(
            (response) =>
              response.request().method() === 'POST' &&
              /\/api\/admin\/feature-flags$/.test(response.url()),
          );
          await authedPage.getByLabel('Key').fill(flagKey);
          await authedPage.getByRole('button', { name: 'Create flag' }).click();
          const createResponse = await createResponsePromise;
          expect(createResponse.status()).toBe(201);
          const createJson = (await createResponse.json()) as {
            data: { flag: { id: string } };
          };
          const flagId = createJson.data.flag.id;

          const flagRow = authedPage
            .locator('tr')
            .filter({ has: authedPage.getByText(flagKey, { exact: true }) });
          await expect(flagRow).toBeVisible();

          const toggleResponsePromise = authedPage.waitForResponse(
            (response) =>
              response.request().method() === 'PATCH' &&
              /\/api\/admin\/feature-flags\/[^/]+$/.test(response.url()),
          );
          await flagRow.getByRole('button', { name: /^(on|off)$/i }).click();
          const toggleResponse = await toggleResponsePromise;
          expect(toggleResponse.status()).toBe(200);

          const deleteResponsePromise = authedPage.waitForResponse(
            (response) =>
              response.request().method() === 'DELETE' &&
              /\/api\/admin\/feature-flags\/[^/]+$/.test(response.url()),
          );
          await flagRow.getByRole('button', { name: 'Delete' }).click();
          await flagRow.getByRole('button', { name: 'Yes' }).click();
          const deleteResponse = await deleteResponsePromise;
          expect(deleteResponse.status()).toBe(200);

          const auditRes = await authedPage.request.get(
            `/api/admin/audit-logs?category=feature_flag&targetType=feature_flag&targetId=${flagId}&limit=50`,
          );
          expect(auditRes.ok()).toBe(true);
          const auditJson = (await auditRes.json()) as {
            data: { events: { action: string; category: string }[] };
          };
          const actions = auditJson.data.events.map((e) => e.action).sort();
          expect(actions).toEqual([
            'feature_flag.create',
            'feature_flag.delete',
            'feature_flag.update',
          ]);
          for (const event of auditJson.data.events) {
            expect(event.category).toBe('feature_flag');
          }
        },
      );

      authTest(
        'approving a newly created waitlist entry records a waitlist category audit event now that the category is enabled',
        async ({ authedPage }) => {
          const email = `e2e+audit-waitlist-${Date.now().toString()}@example.com`;

          const joinResponse = await authedPage.request.post(
            '/api/auth/waitlist',
            { data: { email } },
          );
          expect(
            joinResponse.ok(),
            'Expected POST /api/auth/waitlist to succeed -- set REGISTRATION_MODE=invite-only for this scenario (see pnpm e2e:admin:audit-logs)',
          ).toBe(true);

          await authedPage.goto('/admin/waitlist');
          const entryRow = authedPage
            .locator('tr')
            .filter({ has: authedPage.getByText(email, { exact: true }) });
          await expect(entryRow).toBeVisible();

          const approveResponsePromise = authedPage.waitForResponse(
            (response) =>
              response.request().method() === 'POST' &&
              /\/api\/admin\/waitlist\/[^/]+\?action=approve$/.test(
                response.url(),
              ),
          );
          await entryRow
            .getByRole('button', { name: /approve waitlist application/i })
            .click();
          const approveResponse = await approveResponsePromise;
          expect(approveResponse.status()).toBe(200);

          const auditRes = await authedPage.request.get(
            '/api/admin/audit-logs?category=waitlist&limit=50',
          );
          expect(auditRes.ok()).toBe(true);
          const auditJson = (await auditRes.json()) as {
            data: { events: { action: string; category: string }[] };
          };
          expect(
            auditJson.data.events.some(
              (e) =>
                e.action === 'waitlist.approve' && e.category === 'waitlist',
            ),
          ).toBe(true);
        },
      );

      authTest(
        'disabling admin_access via the settings UI stops new admin panel access audit events from being recorded',
        async ({ authedPage }) => {
          async function countAdminAccessEvents(): Promise<number> {
            const res = await authedPage.request.get(
              '/api/admin/audit-logs?category=admin_access&limit=1',
            );
            expect(res.ok()).toBe(true);
            const json = (await res.json()) as { data: { total: number } };
            return json.data.total;
          }

          const countBeforeNav = await countAdminAccessEvents();

          // A hard navigation (page.goto), not a client-side <Link>
          // transition, is required here -- it forces AdminLayoutGuard to
          // re-run on the server and record a fresh admin_access grant
          // event. A soft navigation between sibling /admin/* routes can
          // reuse the already-rendered layout segment and would not prove
          // anything about the write path.
          await authedPage.goto('/admin/security', { waitUntil: 'load' });
          const countAfterNav = await countAdminAccessEvents();
          expect(countAfterNav).toBe(countBeforeNav + 1);

          const adminAccessRow = authedPage.locator('tr').filter({
            has: authedPage.getByText('admin_access', { exact: true }),
          });
          const disableResponsePromise = authedPage.waitForResponse(
            (response) =>
              response.request().method() === 'PATCH' &&
              response.url().includes('/api/admin/audit-log-settings'),
          );
          await adminAccessRow.getByRole('button', { name: /^on$/i }).click();
          const disableResponse = await disableResponsePromise;
          expect(disableResponse.status()).toBe(200);
          await expect(
            adminAccessRow.getByRole('button', { name: /^off$/i }),
          ).toBeVisible();

          // The settings PATCH itself never touches admin_access audit
          // events -- it's a mutation on audit_log_settings, not a
          // recordAdminAuditEvent call -- so the count should be
          // unaffected by the toggle alone.
          const countAfterDisable = await countAdminAccessEvents();
          expect(countAfterDisable).toBe(countAfterNav);

          await authedPage.goto('/admin/waitlist', { waitUntil: 'load' });
          const countAfterSecondNav = await countAdminAccessEvents();
          expect(countAfterSecondNav).toBe(countAfterDisable);

          // Re-enable so a later interactive re-run against the same
          // container DB (outside the normal per-run reset) finds
          // admin_access back in its default state.
          await authedPage.goto('/admin/security', { waitUntil: 'load' });
          const adminAccessRowAgain = authedPage.locator('tr').filter({
            has: authedPage.getByText('admin_access', { exact: true }),
          });
          const reenableResponsePromise = authedPage.waitForResponse(
            (response) =>
              response.request().method() === 'PATCH' &&
              response.url().includes('/api/admin/audit-log-settings'),
          );
          await adminAccessRowAgain
            .getByRole('button', { name: /^off$/i })
            .click();
          const reenableResponse = await reenableResponsePromise;
          expect(reenableResponse.status()).toBe(200);
        },
      );

      authTest(
        'category filters on GET /api/admin/audit-logs and the browse UI never mix categories',
        async ({ authedPage }) => {
          for (const category of ['feature_flag', 'waitlist', 'admin_access']) {
            const res = await authedPage.request.get(
              `/api/admin/audit-logs?category=${category}&limit=50`,
            );
            expect(res.ok()).toBe(true);
            const json = (await res.json()) as {
              data: { events: { category: string }[] };
            };
            expect(json.data.events.length).toBeGreaterThan(0);
            for (const event of json.data.events) {
              expect(event.category).toBe(category);
            }
          }

          await authedPage.goto('/admin/security/audit-logs');
          await authedPage.getByLabel('Category').selectOption('feature_flag');
          const filterResponsePromise = authedPage.waitForResponse(
            (response) =>
              response.request().method() === 'GET' &&
              response.url().includes('/api/admin/audit-logs') &&
              response.url().includes('category=feature_flag'),
          );
          await authedPage.getByRole('button', { name: 'Filter' }).click();
          await filterResponsePromise;

          await expect(
            authedPage.getByText('feature_flag.create', { exact: true }),
          ).toBeVisible();
          await expect(
            authedPage.getByText('waitlist.approve', { exact: true }),
          ).not.toBeVisible();
          await expect(
            authedPage.getByText('admin_panel.access_granted', {
              exact: true,
            }),
          ).not.toBeVisible();
        },
      );
    },
  );
});
