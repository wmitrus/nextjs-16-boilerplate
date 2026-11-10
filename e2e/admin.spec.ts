import {
  test as base,
  expect,
  type APIRequestContext,
  type Page,
} from '@playwright/test';

import {
  createAuthjsE2ECredentials,
  isAuthjsRuntime,
  provisionAuthjsE2EUser,
  signInAuthjsE2E,
  type AuthjsE2ECredentials,
} from './authjs-auth';
import {
  captureSteppedUpAdminSession,
  enrollTotp,
  ensureFreshStepUp,
  type SteppedUpAdminSession,
} from './authjs-step-up';
import { withLocalE2EDatabase } from './support/e2e-db';

const isAuthjs = isAuthjsRuntime();

/**
 * The waitlist is platform-global (SEC-41): only an env-based platform admin
 * may approve an entry, and the approval is audited at platform-global scope.
 * `pnpm e2e:admin:audit-logs` lists this address in ADMIN_USER_EMAILS.
 */
const AUDIT_PLATFORM_ADMIN_EMAIL = 'e2e+authjs-audit-platform@example.com';

/**
 * Set by the CI workflow whose only job is the audit-settings suite (OZI-220).
 * A misconfigured runtime there must fail loudly: the audit-trail block below
 * skips itself without AuthJS or the db flag provider, and a green run that
 * skipped proves nothing. Required step-up is part of that contract -- a
 * production build refuses the bypass, so the suite must pass the real one.
 */
if (process.env.E2E_REQUIRE_AUDIT_SETTINGS_SUITE === 'true') {
  const misconfigured = [
    !isAuthjs && 'AUTH_PROVIDER=authjs',
    process.env.FEATURE_FLAG_PROVIDER !== 'db' && 'FEATURE_FLAG_PROVIDER=db',
    process.env.ADMIN_STEP_UP_MODE !== 'required' &&
      'ADMIN_STEP_UP_MODE=required',
    !(process.env.ADMIN_USER_EMAILS ?? '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .includes(AUDIT_PLATFORM_ADMIN_EMAIL) &&
      `ADMIN_USER_EMAILS=${AUDIT_PLATFORM_ADMIN_EMAIL}`,
  ].filter(Boolean);
  if (misconfigured.length > 0) {
    throw new Error(
      `[admin.spec] The audit-settings suite must run, but the runtime is missing: ${misconfigured.join(', ')}. Run it through \`pnpm e2e:admin:audit-logs\`.`,
    );
  }
}
const baseURL = process.env.PLAYWRIGHT_TEST_BASE_URL ?? 'http://localhost:3100';
const authTest = base.extend<
  {
    authedPage: Page;
    platformPage: Page;
  },
  {
    authRequest: APIRequestContext;
    adminSession: SteppedUpAdminSession & {
      credentials: AuthjsE2ECredentials;
    };
    platformAdminSession: SteppedUpAdminSession;
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
  // SEC-48: the shared admin enrolls a real TOTP factor and answers the
  // real step-up challenge, so this suite runs with ADMIN_STEP_UP_MODE=required
  // against a production build -- the bypass is never involved.
  adminSession: [
    async ({ browser, authRequest }, runWithSession) => {
      const credentials = createAuthjsE2ECredentials('admin-shared');
      await provisionAuthjsE2EUser(authRequest, credentials);
      const session = await captureSteppedUpAdminSession(browser, credentials);
      await runWithSession({ ...session, credentials });
    },
    { scope: 'worker' },
  ],
  // Same real step-up, for the platform admin. A fixed address (the server
  // reads ADMIN_USER_EMAILS at startup), so a retry worker cannot re-enroll
  // it -- acceptable: this serial, stateful file does not survive retries of
  // its mutating tests anyway.
  platformAdminSession: [
    async ({ browser, authRequest }, runWithSession) => {
      const credentials = {
        email: AUDIT_PLATFORM_ADMIN_EMAIL,
        password: 'E2E-Password-123!',
      };
      await provisionAuthjsE2EUser(authRequest, credentials);
      await runWithSession(
        await captureSteppedUpAdminSession(browser, credentials),
      );
    },
    { scope: 'worker' },
  ],
  authedPage: async ({ browser, adminSession }, runWithPage) => {
    await ensureFreshStepUp(browser, adminSession);
    const context = await browser.newContext({
      storageState: adminSession.storageState,
    });
    const page = await context.newPage();
    await runWithPage(page);
    await context.close();
  },
  platformPage: async ({ browser, platformAdminSession }, runWithPage) => {
    await ensureFreshStepUp(browser, platformAdminSession);
    const context = await browser.newContext({
      storageState: platformAdminSession.storageState,
    });
    const page = await context.newPage();
    await runWithPage(page);
    await context.close();
  },
});
// One fixture pool for the whole serial file. Mixing `base` and `authTest`
// gives the group two worker digests, and Playwright then fails every retry
// with "inconsistent test.use() options" -- one flaky test sank the CI job.
// Fixtures are lazy: unauthenticated tests never sign anyone in.
const test = authTest;

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
        // `visible: true` skips React's streaming copy: a resolved Suspense
        // boundary sits in a `hidden` container until it is swapped in, so
        // for a moment the DOM holds two breadcrumbs and a strict locator
        // flaked. Two *visible* breadcrumbs would still fail.
        await expect(
          authedPage
            .locator('span')
            .filter({ hasText: /^Administration$/, visible: true }),
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
        // `visible: true`: see the breadcrumb test (streamed copy).
        await expect(
          authedPage
            .getByText(
              /choose an organization before sending direct invitations/i,
            )
            .filter({ visible: true }),
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
        'refuses an audit-settings PATCH without MFA, without a proof, after a wrong code and with a forged or borrowed proof, leaving the database untouched',
        async ({ browser, authRequest, adminSession }) => {
          const credentials = createAuthjsE2ECredentials('audit-step-up-deny');
          await provisionAuthjsE2EUser(authRequest, credentials);
          const context = await browser.newContext();
          try {
            const page = await context.newPage();
            await signInAuthjsE2E(page, credentials);
            const patch = () =>
              page.request.fetch('/api/admin/audit-log-settings', {
                method: 'PATCH',
                data: {
                  category: 'billing',
                  enabled: true,
                  retentionDays: 90,
                  captureInputOnSuccess: false,
                },
              });

            // No second factor yet: enrollment comes before any proof.
            const unenrolled = await patch();
            expect(unenrolled.status()).toBe(403);
            expect(((await unenrolled.json()) as { code?: string }).code).toBe(
              'MFA_ENROLLMENT_REQUIRED',
            );

            await enrollTotp(page.request);

            // The running production build enforces step-up: no bypass.
            const status = await page.request.get('/api/auth/step-up');
            expect(status.status()).toBe(200);
            expect(
              ((await status.json()) as { data: { enforcement: string } }).data
                .enforcement,
            ).toBe('required');

            const noProof = await patch();
            expect(noProof.status()).toBe(403);
            expect(((await noProof.json()) as { code?: string }).code).toBe(
              'STEP_UP_REQUIRED',
            );

            const wrongCode = await page.request.fetch('/api/auth/step-up', {
              method: 'POST',
              data: { code: '000000' },
            });
            expect(wrongCode.status()).toBe(401);
            expect(((await wrongCode.json()) as { code?: string }).code).toBe(
              'MFA_CODE_INVALID',
            );

            const afterWrongCode = await patch();
            expect(afterWrongCode.status()).toBe(403);
            expect(
              ((await afterWrongCode.json()) as { code?: string }).code,
            ).toBe('STEP_UP_REQUIRED');

            // No client-side bypass either: the proof is HMAC-bound to its
            // holder, so neither a forged value nor another admin's genuine,
            // live proof opens the gate.
            const genuineProof = adminSession.storageState.cookies.find(
              (cookie) => cookie.name === 'step_up_proof',
            );
            expect(genuineProof).toBeDefined();
            for (const value of ['forged.step-up.proof', genuineProof!.value]) {
              await context.addCookies([{ ...genuineProof!, value }]);
              const borrowed = await patch();
              expect(borrowed.status()).toBe(403);
              expect(((await borrowed.json()) as { code?: string }).code).toBe(
                'STEP_UP_REQUIRED',
              );
            }

            const written = await withLocalE2EDatabase(
              (sql) => sql`
                select count(*)::int as n
                from audit_log_settings s
                join users u on u.id = s.updated_by_user_id
                where u.email = ${credentials.email}
              `,
            );
            expect(written[0]?.n).toBe(0);
          } finally {
            await context.close().catch(() => undefined);
          }
        },
      );

      authTest(
        'enables the waitlist audit category via the settings UI (feature_flag stays on by default)',
        async ({ authedPage, adminSession }) => {
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
          const { setting } = (
            (await enableWaitlistResponse.json()) as {
              data: { setting: { id: string; category: string } };
            }
          ).data;
          expect(setting.category).toBe('waitlist');

          await expect(
            waitlistRow.getByRole('button', { name: /^on$/i }),
          ).toBeVisible();

          // Persisted, not just acknowledged: the row the UI wrote, read back
          // from the real database, attributed to the stepped-up admin.
          const [row] = await withLocalE2EDatabase(
            (sql) => sql`
              select s.category, s.enabled, s.ownership_state,
                     s.organization_id is not null as has_organization,
                     u.email as updated_by_email
              from audit_log_settings s
              left join users u on u.id = s.updated_by_user_id
              where s.id = ${setting.id}
            `,
          );
          expect(row).toEqual({
            category: 'waitlist',
            enabled: true,
            ownership_state: 'canonical_organization',
            has_organization: true,
            updated_by_email: adminSession.credentials.email,
          });

          // And the server renders that state on a fresh load.
          await authedPage.reload();
          await expect(
            authedPage
              .locator('tr')
              .filter({
                has: authedPage.getByText('waitlist', { exact: true }),
              })
              .getByRole('button', { name: /^on$/i }),
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
        'a platform admin enables the global waitlist category via the settings UI, then approving an entry records a waitlist audit event',
        async ({ platformPage }) => {
          // SEC-41: the waitlist is platform-global. Only a platform admin may
          // approve, and the approval is audited at platform-global scope, so
          // the organization override above does not apply to it -- the
          // global default has to be switched on, through the same UI.
          await platformPage.goto('/admin/security');
          await expect(platformPage.getByText('global defaults')).toBeVisible();

          const globalWaitlistRow = platformPage.locator('tr').filter({
            has: platformPage.getByText('waitlist', { exact: true }),
          });
          const enableResponsePromise = platformPage.waitForResponse(
            (response) =>
              response.request().method() === 'PATCH' &&
              response.url().endsWith('/api/admin/audit-log-settings'),
          );
          await globalWaitlistRow
            .getByRole('button', { name: /^off$/i })
            .click();
          const enableResponse = await enableResponsePromise;
          expect(enableResponse.status()).toBe(200);
          const { setting } = (
            (await enableResponse.json()) as {
              data: { setting: { id: string; tenantId: string | null } };
            }
          ).data;
          expect(setting.tenantId).toBeNull();

          const [row] = await withLocalE2EDatabase(
            (sql) => sql`
              select s.category, s.enabled, s.ownership_state,
                     s.organization_id, u.email as updated_by_email
              from audit_log_settings s
              left join users u on u.id = s.updated_by_user_id
              where s.id = ${setting.id}
            `,
          );
          expect(row).toEqual({
            category: 'waitlist',
            enabled: true,
            ownership_state: 'intentional_global',
            organization_id: null,
            updated_by_email: AUDIT_PLATFORM_ADMIN_EMAIL,
          });

          const email = `e2e+audit-waitlist-${Date.now().toString()}@example.com`;
          const joinResponse = await platformPage.request.post(
            '/api/auth/waitlist',
            { data: { email } },
          );
          expect(
            joinResponse.ok(),
            'Expected POST /api/auth/waitlist to succeed -- set REGISTRATION_MODE=invite-only for this scenario (see pnpm e2e:admin:audit-logs)',
          ).toBe(true);

          await platformPage.goto('/admin/waitlist');
          const entryRow = platformPage
            .locator('tr')
            // `visible: true`: see the breadcrumb test (streamed copy).
            .filter({
              has: platformPage.getByText(email, { exact: true }),
              visible: true,
            });
          await expect(entryRow).toBeVisible();

          const approveResponsePromise = platformPage.waitForResponse(
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

          const auditRes = await platformPage.request.get(
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
        // The platform admin browses every scope: the waitlist event above is
        // platform-global, invisible to an organization admin by design.
        async ({ platformPage: authedPage }) => {
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
          // The browser applies a filter on change; there is no submit button.
          const filterResponsePromise = authedPage.waitForResponse(
            (response) =>
              response.request().method() === 'GET' &&
              response.url().includes('/api/admin/audit-logs') &&
              response.url().includes('category=feature_flag'),
          );
          await authedPage.getByLabel('Category').selectOption('feature_flag');
          expect((await filterResponsePromise).status()).toBe(200);

          // Two suites above each create a flag: at least one row, any count.
          await expect(
            authedPage
              .getByText('feature_flag.create', { exact: true })
              .first(),
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
