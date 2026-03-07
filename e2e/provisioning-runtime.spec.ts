import { createPageObjects } from '@clerk/testing/playwright/unstable';
import { test, expect, type Page } from '@playwright/test';

import {
  getClerkE2EOrganizationSlug,
  hasClerkIdentityE2ECredentials,
  signInClerkIdentityE2E,
  signInClerkOrgDbSeededMemberE2E,
  signInClerkOrgProviderOwnerE2E,
  signInClerkPersonalNewUserE2E,
  signInSingleNewUserE2E,
} from './clerk-auth';
import {
  getRuntimeProfile,
  isMissingSeededDefaultTenant,
  isOrgDbRuntime,
  isOrgProviderRuntime,
  isPersonalRuntime,
  isSingleRuntime,
  SEEDED_TENANT_IDS,
} from './runtime-profile';

const runtime = getRuntimeProfile();

type BrowserOrganizationMembership = {
  organization?: {
    id?: string;
    slug?: string;
  };
  publicOrganizationData?: {
    id?: string;
    organizationId?: string;
    slug?: string;
  };
  organizationSlug?: string;
};

type BrowserClerkUser = {
  getOrganizationMemberships?: () => Promise<
    | BrowserOrganizationMembership[]
    | {
        data?: BrowserOrganizationMembership[];
      }
  >;
  organizationMemberships?: BrowserOrganizationMembership[];
};

type BrowserClerk = {
  loaded?: boolean;
  session?: {
    id: string;
  };
  user?: BrowserClerkUser;
  setActive: (params: {
    session?: string;
    organization?: string | null;
  }) => Promise<void>;
};

function getBaseUrl(): string {
  return process.env.PLAYWRIGHT_TEST_BASE_URL ?? 'http://localhost:3000';
}

function getPathname(url: string): string {
  return new URL(url).pathname;
}

async function waitForBootstrapRequest(
  page: Page,
  action: () => Promise<void>,
): Promise<void> {
  const bootstrapRequest = page.waitForRequest(
    (request) =>
      request.isNavigationRequest() &&
      getPathname(request.url()) === '/auth/bootstrap',
  );

  await action();
  await bootstrapRequest;
}

async function completeOnboarding(page: Page): Promise<void> {
  await expect(
    page.getByRole('heading', { name: /complete your profile/i }),
  ).toBeVisible();
  await page.getByLabel(/display name/i).fill('E2E User');
  await page.getByLabel(/language/i).selectOption('en-US');
  await page.getByLabel(/timezone/i).selectOption('Europe/Warsaw');
  await page.getByRole('button', { name: /get started/i }).click();
}

async function expectProvisioningReady(
  page: Page,
  expectedTenancyMode: 'single' | 'personal' | 'org',
): Promise<void> {
  const probe = await page.request.get('/api/me/provisioning-status');
  expect(probe.status()).toBe(200);

  const probeBody = await probe.json();
  expect(probeBody.status).toBe('ok');
  expect(probeBody.data.tenancyMode).toBe(expectedTenancyMode);
  expect(probeBody.data.internalUserId).toBeTruthy();
  expect(probeBody.data.internalTenantId).toBeTruthy();
  expect(probeBody.data.onboardingComplete).toBe(true);

  const api = await page.request.get('/api/users');
  expect(api.status()).toBe(200);
}

async function expectBootstrapErrorUi(
  page: Page,
  expectedMessage: RegExp,
): Promise<void> {
  await expect(
    page.getByRole('heading', { name: /sign-in could not be completed/i }),
  ).toBeVisible();
  await expect(page.getByText(expectedMessage)).toBeVisible();
}

async function setActiveTenantCookie(
  page: Page,
  tenantId: string,
): Promise<void> {
  await page.context().addCookies([
    {
      name: runtime.tenantContextCookie,
      value: tenantId,
      url: getBaseUrl(),
    },
  ]);
}

async function clearActiveTenantCookie(page: Page): Promise<void> {
  await page.context().addCookies([
    {
      name: runtime.tenantContextCookie,
      value: '',
      url: getBaseUrl(),
      expires: 0,
    },
  ]);
}

async function setActiveOrganization(page: Page, organizationSlug: string) {
  await page.waitForFunction(() =>
    Boolean(window.Clerk?.loaded && window.Clerk?.user),
  );
  await page.evaluate(async (slug) => {
    const clerk = (window as typeof window & { Clerk?: BrowserClerk }).Clerk;
    const user = clerk?.user;

    if (!clerk || !user) {
      throw new Error('Clerk user is not loaded in the browser context.');
    }

    const rawMemberships = await user.getOrganizationMemberships?.();
    const memberships = Array.isArray(rawMemberships)
      ? rawMemberships
      : (rawMemberships?.data ??
        user.organizationMemberships ??
        ([] as BrowserOrganizationMembership[]));

    const membership = memberships.find((entry) => {
      const membershipSlug =
        entry?.organization?.slug ??
        entry?.publicOrganizationData?.slug ??
        entry?.organizationSlug;
      return membershipSlug === slug;
    });

    const organizationId =
      membership?.organization?.id ??
      membership?.publicOrganizationData?.organizationId ??
      membership?.publicOrganizationData?.id;

    if (!organizationId) {
      throw new Error(`No organization membership found for slug '${slug}'.`);
    }

    await clerk.setActive({ organization: organizationId });
  }, organizationSlug);
}

async function clearActiveOrganization(page: Page) {
  await page.waitForFunction(() =>
    Boolean(window.Clerk?.loaded && window.Clerk?.session),
  );
  await page.evaluate(async () => {
    const clerk = (window as typeof window & { Clerk?: BrowserClerk }).Clerk;
    if (!clerk?.session) {
      throw new Error('Clerk session is not loaded in the browser context.');
    }

    await clerk.setActive({
      session: clerk.session.id,
      organization: null,
    });
  });
}

test.describe('Provisioning Runtime E2E', () => {
  test.describe.configure({ mode: 'serial' });

  test('single mode: active external session without internal provisioning hits bootstrap and probe returns BOOTSTRAP_REQUIRED', async ({
    page,
  }) => {
    test.skip(
      !isSingleRuntime(runtime),
      'Run this scenario with AUTH_PROVIDER=clerk and TENANCY_MODE=single.',
    );
    test.skip(
      !hasClerkIdentityE2ECredentials('singleProvisionedUser'),
      'Set E2E_CLERK_SINGLE_PROVISIONED_USER_USERNAME and E2E_CLERK_SINGLE_PROVISIONED_USER_PASSWORD for the bootstrap-required probe path.',
    );

    await signInClerkIdentityE2E(page, 'singleProvisionedUser');

    const probe = await page.request.get('/api/me/provisioning-status');
    expect(probe.status()).toBe(409);

    const probeBody = await probe.json();
    expect(probeBody.code).toBe('BOOTSTRAP_REQUIRED');

    await waitForBootstrapRequest(page, async () => {
      await page.goto('/users');
    });
    await expect(page).toHaveURL(/\/onboarding\?redirect_url=%2Fusers/);
  });

  test('single mode: first login goes through bootstrap, preserves redirect_url, completes onboarding, then reaches the app', async ({
    page,
  }) => {
    test.skip(
      !isSingleRuntime(runtime),
      'Run this scenario with AUTH_PROVIDER=clerk and TENANCY_MODE=single.',
    );
    test.skip(
      !hasClerkIdentityE2ECredentials('singleNewUser'),
      'Set E2E_CLERK_SINGLE_NEW_USER_USERNAME and E2E_CLERK_SINGLE_NEW_USER_PASSWORD.',
    );

    await signInSingleNewUserE2E(page);

    await page.goto('/auth/bootstrap?redirect_url=/app/dashboard');
    await expect(page).toHaveURL(
      /\/onboarding\?redirect_url=%2Fapp%2Fdashboard/,
    );
    await completeOnboarding(page);
    await expect(page).toHaveURL(/\/app\/dashboard$/);

    await page.goto('/users');
    await expect(page.getByText(/user management/i)).toBeVisible();
    await expectProvisioningReady(page, 'single');
  });

  test('single mode: returning login skips onboarding and lands in the app', async ({
    page,
  }) => {
    test.skip(
      !isSingleRuntime(runtime),
      'Run this scenario with AUTH_PROVIDER=clerk and TENANCY_MODE=single.',
    );
    test.skip(
      !hasClerkIdentityE2ECredentials('singleNewUser'),
      'Set E2E_CLERK_SINGLE_NEW_USER_USERNAME and E2E_CLERK_SINGLE_NEW_USER_PASSWORD.',
    );

    await signInSingleNewUserE2E(page);

    await page.goto('/auth/bootstrap?redirect_url=/users');
    await expect(page).toHaveURL(/\/users$/);
    await expect(page.getByText(/user management/i)).toBeVisible();
    await expectProvisioningReady(page, 'single');
  });

  test('single mode with missing default tenant renders controlled bootstrap error UI', async ({
    page,
  }) => {
    test.skip(
      !isMissingSeededDefaultTenant(runtime),
      'Run this scenario with TENANCY_MODE=single and DEFAULT_TENANT_ID pointing to a non-seeded tenant.',
    );
    test.skip(
      !hasClerkIdentityE2ECredentials('singleProvisionedUser'),
      'Set E2E_CLERK_SINGLE_PROVISIONED_USER_USERNAME and E2E_CLERK_SINGLE_PROVISIONED_USER_PASSWORD.',
    );

    await signInClerkIdentityE2E(page, 'singleProvisionedUser');

    await page.goto('/auth/bootstrap');
    await expectBootstrapErrorUi(
      page,
      /workspace configuration is incomplete or missing/i,
    );
    await expect(page.content()).not.toContain('Failed query:');
  });

  test('single mode with blocked cross-provider linking renders controlled error UI', async ({
    page,
  }) => {
    test.skip(
      !isSingleRuntime(runtime) ||
        runtime.crossProviderEmailLinking !== 'disabled',
      'Run this scenario with TENANCY_MODE=single and CROSS_PROVIDER_EMAIL_LINKING=disabled.',
    );
    test.skip(
      !hasClerkIdentityE2ECredentials('linkingBlockedUnverified'),
      'Set E2E_CLERK_LINK_BLOCKED_UNVERIFIED_USERNAME and E2E_CLERK_LINK_BLOCKED_UNVERIFIED_PASSWORD.',
    );

    await signInClerkIdentityE2E(page, 'linkingBlockedUnverified');

    await page.goto('/auth/bootstrap');
    await expectBootstrapErrorUi(page, /linked to a different sign-in method/i);
    await expect(page.content()).not.toContain('auth_user_identities');
  });

  test('single mode with free-tier limit reached renders controlled quota error UI', async ({
    page,
  }) => {
    test.skip(
      !isSingleRuntime(runtime) || runtime.freeTierMaxUsers > 2,
      'Run this scenario with TENANCY_MODE=single and FREE_TIER_MAX_USERS <= 2.',
    );
    test.skip(
      !hasClerkIdentityE2ECredentials('singleNewUser'),
      'Set E2E_CLERK_SINGLE_NEW_USER_USERNAME and E2E_CLERK_SINGLE_NEW_USER_PASSWORD.',
    );

    await signInClerkIdentityE2E(page, 'singleNewUser');

    await page.goto('/auth/bootstrap');
    await expectBootstrapErrorUi(page, /workspace has reached its user limit/i);
    await expect(page.content()).not.toContain('tenant_attributes');
  });

  test('personal mode: first login provisions a personal tenant, completes onboarding, and reaches the app', async ({
    page,
  }) => {
    test.skip(
      !isPersonalRuntime(runtime),
      'Run this scenario with AUTH_PROVIDER=clerk and TENANCY_MODE=personal.',
    );
    test.skip(
      !hasClerkIdentityE2ECredentials('personalNewUser'),
      'Set E2E_CLERK_PERSONAL_NEW_USER_USERNAME and E2E_CLERK_PERSONAL_NEW_USER_PASSWORD.',
    );

    await signInClerkPersonalNewUserE2E(page);

    await page.goto('/auth/bootstrap?redirect_url=/users');
    await expect(page).toHaveURL(/\/onboarding\?redirect_url=%2Fusers/);
    await completeOnboarding(page);
    await expect(page).toHaveURL(/\/users$/);
    await expectProvisioningReady(page, 'personal');
  });

  test('personal mode: returning login skips onboarding and lands in the app', async ({
    page,
  }) => {
    test.skip(
      !isPersonalRuntime(runtime),
      'Run this scenario with AUTH_PROVIDER=clerk and TENANCY_MODE=personal.',
    );
    test.skip(
      !hasClerkIdentityE2ECredentials('personalNewUser'),
      'Set E2E_CLERK_PERSONAL_NEW_USER_USERNAME and E2E_CLERK_PERSONAL_NEW_USER_PASSWORD.',
    );

    await signInClerkPersonalNewUserE2E(page);

    await page.goto('/auth/bootstrap?redirect_url=/users');
    await expect(page).toHaveURL(/\/users$/);
    await expectProvisioningReady(page, 'personal');
  });

  test('org/provider mode: first login with an active org goes through bootstrap, onboarding, then the app', async ({
    page,
  }) => {
    test.skip(
      !isOrgProviderRuntime(runtime),
      'Run this scenario with AUTH_PROVIDER=clerk, TENANCY_MODE=org and TENANT_CONTEXT_SOURCE=provider.',
    );
    test.skip(
      !hasClerkIdentityE2ECredentials('orgProviderOwner'),
      'Set E2E_CLERK_ORG_PROVIDER_OWNER_USERNAME and E2E_CLERK_ORG_PROVIDER_OWNER_PASSWORD.',
    );

    await signInClerkOrgProviderOwnerE2E(page);
    await setActiveOrganization(
      page,
      getClerkE2EOrganizationSlug('providerOwner'),
    );

    await page.goto('/auth/bootstrap?redirect_url=/users');
    await expect(page).toHaveURL(/\/onboarding\?redirect_url=%2Fusers/);
    await completeOnboarding(page);
    await expect(page).toHaveURL(/\/users$/);
    await expectProvisioningReady(page, 'org');
  });

  test('org/provider mode without an active org renders controlled tenant_config UI', async ({
    page,
  }) => {
    test.skip(
      !isOrgProviderRuntime(runtime),
      'Run this scenario with AUTH_PROVIDER=clerk, TENANCY_MODE=org and TENANT_CONTEXT_SOURCE=provider.',
    );
    test.skip(
      !hasClerkIdentityE2ECredentials('orgProviderOwner'),
      'Set E2E_CLERK_ORG_PROVIDER_OWNER_USERNAME and E2E_CLERK_ORG_PROVIDER_OWNER_PASSWORD.',
    );

    await signInClerkOrgProviderOwnerE2E(page);
    await clearActiveOrganization(page);

    await page.goto('/auth/bootstrap');
    await expectBootstrapErrorUi(
      page,
      /workspace configuration is incomplete or missing/i,
    );
  });

  test('org/db mode without an active tenant cookie renders controlled tenant_config UI', async ({
    page,
  }) => {
    test.skip(
      !isOrgDbRuntime(runtime),
      'Run this scenario with AUTH_PROVIDER=clerk, TENANCY_MODE=org and TENANT_CONTEXT_SOURCE=db.',
    );
    test.skip(
      !hasClerkIdentityE2ECredentials('orgDbSeededMember'),
      'Set E2E_CLERK_ORG_DB_SEEDED_MEMBER_USERNAME and E2E_CLERK_ORG_DB_SEEDED_MEMBER_PASSWORD.',
    );

    await signInClerkOrgDbSeededMemberE2E(page);
    await clearActiveTenantCookie(page);

    await page.goto('/auth/bootstrap');
    await expectBootstrapErrorUi(
      page,
      /workspace configuration is incomplete or missing/i,
    );
  });

  test('org/db mode: first login with active tenant cookie goes through bootstrap, onboarding, then the app', async ({
    page,
  }) => {
    test.skip(
      !isOrgDbRuntime(runtime),
      'Run this scenario with AUTH_PROVIDER=clerk, TENANCY_MODE=org and TENANT_CONTEXT_SOURCE=db.',
    );
    test.skip(
      !hasClerkIdentityE2ECredentials('orgDbSeededMember'),
      'Set E2E_CLERK_ORG_DB_SEEDED_MEMBER_USERNAME and E2E_CLERK_ORG_DB_SEEDED_MEMBER_PASSWORD. The email must be bob@example.com for the seeded org/db positive path.',
    );

    await signInClerkOrgDbSeededMemberE2E(page);
    await setActiveTenantCookie(page, SEEDED_TENANT_IDS.acme);

    await page.goto('/auth/bootstrap?redirect_url=/users');
    await expect(page).toHaveURL(/\/onboarding\?redirect_url=%2Fusers/);
    await completeOnboarding(page);
    await expect(page).toHaveURL(/\/users$/);
    await expectProvisioningReady(page, 'org');
  });

  test('org/db mode with active tenant but no membership returns 403 from protected API', async ({
    page,
  }) => {
    test.skip(
      !isOrgDbRuntime(runtime),
      'Run this scenario with AUTH_PROVIDER=clerk, TENANCY_MODE=org and TENANT_CONTEXT_SOURCE=db.',
    );
    test.skip(
      !hasClerkIdentityE2ECredentials('orgDbSeededMember'),
      'Set E2E_CLERK_ORG_DB_SEEDED_MEMBER_USERNAME and E2E_CLERK_ORG_DB_SEEDED_MEMBER_PASSWORD. The email must be bob@example.com for the seeded org/db membership path.',
    );

    await signInClerkOrgDbSeededMemberE2E(page);
    await setActiveTenantCookie(page, SEEDED_TENANT_IDS.globex);

    const response = await page.request.get('/api/users');
    expect(response.status()).toBe(403);

    const body = await response.json();
    expect(body.code).toBe('TENANT_MEMBERSHIP_REQUIRED');
  });

  test('OAuth sign-in entry that creates a brand-new user lands on /auth/bootstrap', async ({
    page,
  }) => {
    test.skip(
      !runtime.oauthProvider,
      'Set E2E_CLERK_OAUTH_PROVIDER to run real OAuth redirect E2E.',
    );

    const clerkUi = createPageObjects({
      page,
      baseURL: getBaseUrl(),
    });

    await clerkUi.signIn.goTo();
    await waitForBootstrapRequest(page, async () => {
      await clerkUi.signIn.signInWithOauth(runtime.oauthProvider!).click();
    });
  });

  test('OAuth sign-up entry lands on /auth/bootstrap', async ({ page }) => {
    test.skip(
      !runtime.oauthProvider,
      'Set E2E_CLERK_OAUTH_PROVIDER to run real OAuth redirect E2E.',
    );

    const clerkUi = createPageObjects({
      page,
      baseURL: getBaseUrl(),
    });

    await clerkUi.signUp.goTo();
    await waitForBootstrapRequest(page, async () => {
      await clerkUi.signUp.signUpWithOauth(runtime.oauthProvider!).click();
    });
  });
});
