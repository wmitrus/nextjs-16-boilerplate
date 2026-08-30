import { expect, test, type Browser, type Page } from '@playwright/test';

import {
  createAuthjsE2ECredentials,
  isAuthjsRuntime,
  provisionAuthjsE2EUser,
  signInAuthjsE2E,
  type OrganizationContainmentFixture,
} from './authjs-auth';

const PLATFORM_ADMIN_EMAIL = 'e2e+authjs-ozi78-platform@example.com';

async function signedInPage(browser: Browser, email: string, password: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signInAuthjsE2E(page, { email, password });
  return { context, page };
}

async function expectOrganizationAccess(
  page: Page,
  organizationId: string,
  status: number,
) {
  const response = await page.request.get(
    `/api/admin/organizations/${organizationId}`,
  );
  expect(response.status()).toBe(status);
}

async function expectOrganizationListing(
  page: Page,
  expectedIds: string[],
  excludedIds: string[],
) {
  const response = await page.request.get('/api/admin/organizations');
  expect(response.status()).toBe(200);

  const body = (await response.json()) as {
    data: { organizations: Array<{ id: string }> };
  };
  expect(
    body.data.organizations.map((organization) => organization.id),
  ).toEqual(expect.arrayContaining(expectedIds));
  const organizationIds = body.data.organizations.map(
    (organization) => organization.id,
  );
  for (const organizationId of excludedIds) {
    expect(organizationIds).not.toContain(organizationId);
  }
}

test.describe('Admin organization containment (AuthJS)', () => {
  test.describe.configure({ mode: 'serial' });

  test.skip(
    !isAuthjsRuntime(),
    'Runs only with AUTH_PROVIDER=authjs through the local scenario runner.',
  );

  let fixture: OrganizationContainmentFixture | undefined;

  test('contains a normal admin to the active organization', async ({
    browser,
    request,
  }) => {
    const normalCredentials = createAuthjsE2ECredentials('organization-scope');
    fixture = await provisionAuthjsE2EUser(request, normalCredentials, {
      organizationContainmentFixture: true,
    });
    expect(fixture).toBeDefined();
    if (!fixture) throw new Error('Organization containment fixture missing.');

    const normal = await signedInPage(
      browser,
      normalCredentials.email,
      normalCredentials.password,
    );
    try {
      await expectOrganizationListing(
        normal.page,
        [fixture.activeOrganizationId],
        [fixture.siblingOrganizationId, fixture.outsideTenantOrganizationId],
      );
      await expectOrganizationAccess(
        normal.page,
        fixture.activeOrganizationId,
        200,
      );
      await expectOrganizationAccess(
        normal.page,
        fixture.siblingOrganizationId,
        404,
      );
      await expectOrganizationAccess(
        normal.page,
        fixture.outsideTenantOrganizationId,
        404,
      );

      const nestedSibling = await normal.page.goto(
        `/admin/organizations/${fixture.siblingOrganizationId}/members`,
      );
      expect(nestedSibling?.status()).toBe(404);
      const nestedOutsideTenant = await normal.page.goto(
        `/admin/organizations/${fixture.outsideTenantOrganizationId}/members`,
      );
      expect(nestedOutsideTenant?.status()).toBe(404);
    } finally {
      await normal.context.close();
    }
  });

  test('preserves active-tenant platform scope', async ({
    browser,
    request,
  }) => {
    if (!fixture) {
      throw new Error('Organization containment fixture was not established.');
    }

    const platformCredentials = {
      email: PLATFORM_ADMIN_EMAIL,
      password: 'E2E-Password-123!',
    };
    await provisionAuthjsE2EUser(request, platformCredentials);

    const platform = await signedInPage(
      browser,
      platformCredentials.email,
      platformCredentials.password,
    );
    try {
      await expectOrganizationListing(
        platform.page,
        [fixture.activeOrganizationId, fixture.siblingOrganizationId],
        [fixture.outsideTenantOrganizationId],
      );
      await expectOrganizationAccess(
        platform.page,
        fixture.activeOrganizationId,
        200,
      );
      await expectOrganizationAccess(
        platform.page,
        fixture.siblingOrganizationId,
        200,
      );
      await expectOrganizationAccess(
        platform.page,
        fixture.outsideTenantOrganizationId,
        404,
      );
    } finally {
      await platform.context.close();
    }
  });
});
