import { createPageObjects } from '@clerk/testing/playwright/unstable';
import {
  test,
  expect,
  type ConsoleMessage,
  type Page,
  type Response,
} from '@playwright/test';

import {
  getClerkE2EOrganizationSlug,
  hasClerkIncompleteUserE2ECredentials,
  hasClerkIdentityE2ECredentials,
  signInClerkIncompleteUserE2E,
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
const ONBOARDING_PENDING_COOKIE = '__onboarding_pending';

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
    getToken?: () => Promise<string | null>;
  };
  user?: BrowserClerkUser;
  signOut?: () => Promise<void>;
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

function getPathWithSearch(url: string): string {
  const parsed = new URL(url);
  return `${parsed.pathname}${parsed.search}`;
}

const PHASE4_FAILURE_PATTERN =
  /blocking-route|Rendering\.\.\.|outside of <Suspense>|Data that blocks navigation/i;

type RuntimeSignalRecorder = {
  readonly pageErrors: string[];
  readonly matchedConsoleErrors: string[];
  readonly transitions: string[];
  assertNoPhase4Failures: () => void;
};

function createRuntimeSignalRecorder(page: Page): RuntimeSignalRecorder {
  const pageErrors: string[] = [];
  const matchedConsoleErrors: string[] = [];
  const transitions: string[] = [];

  const recordTransition = (url: string) => {
    if (!url || url === 'about:blank') {
      return;
    }

    transitions.push(getPathWithSearch(url));
  };

  const handleConsole = (message: ConsoleMessage) => {
    if (
      message.type() === 'error' &&
      PHASE4_FAILURE_PATTERN.test(message.text())
    ) {
      matchedConsoleErrors.push(message.text());
    }
  };

  recordTransition(page.url());
  page.on('pageerror', (error) => {
    pageErrors.push(error.message);
  });
  page.on('console', handleConsole);
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) {
      recordTransition(frame.url());
    }
  });

  return {
    pageErrors,
    matchedConsoleErrors,
    transitions,
    assertNoPhase4Failures: () => {
      expect(
        pageErrors.filter((message) => PHASE4_FAILURE_PATTERN.test(message)),
      ).toEqual([]);
      expect(matchedConsoleErrors).toEqual([]);
    },
  };
}

async function waitForPathResponse(
  page: Page,
  pathname: string,
  action: () => Promise<void>,
  predicate: (response: Response) => boolean = () => true,
): Promise<Response> {
  const responsePromise = page.waitForResponse(
    (response) =>
      getPathname(response.url()) === pathname && predicate(response),
  );

  await action();
  return responsePromise;
}

async function waitForBootstrapRequest(
  page: Page,
  action: () => Promise<void>,
): Promise<void> {
  const bootstrapRequest = page.waitForRequest(
    (request) => getPathname(request.url()) === '/auth/bootstrap/start',
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

async function expectOnboardingIncomplete(page: Page): Promise<void> {
  const probe = await browserJsonRequest(page, '/api/me/provisioning-status');
  expect(probe.status).toBe(409);

  const probeBody = probe.body as {
    code: string;
  };

  expect(probeBody.code).toBe('ONBOARDING_REQUIRED');
  await expect(
    page.getByRole('heading', { name: /complete your profile/i }),
  ).toBeVisible();
}

async function signOutClerkSession(page: Page): Promise<void> {
  await page.waitForFunction(() => Boolean(window.Clerk?.loaded));
  await page.evaluate(async () => {
    const clerk = (window as typeof window & { Clerk?: BrowserClerk }).Clerk;
    await clerk?.signOut?.();
  });
  await page.waitForFunction(
    () => Boolean(window.Clerk?.loaded) && !window.Clerk?.session,
  );
}

async function getCookieValue(
  page: Page,
  name: string,
): Promise<string | undefined> {
  const cookies = await page.context().cookies([getBaseUrl()]);
  return cookies.find((cookie) => cookie.name === name)?.value;
}

async function expectCookieValue(
  page: Page,
  name: string,
  expectedValue: string,
): Promise<void> {
  expect(await getCookieValue(page, name)).toBe(expectedValue);
}

async function expectCookieAbsent(page: Page, name: string): Promise<void> {
  expect(await getCookieValue(page, name)).toBeUndefined();
}

async function setOnboardingPendingCookie(page: Page): Promise<void> {
  await page.context().addCookies([
    {
      name: ONBOARDING_PENDING_COOKIE,
      value: '1',
      url: getBaseUrl(),
    },
  ]);
}

async function clearOnboardingPendingCookie(page: Page): Promise<void> {
  await page.context().addCookies([
    {
      name: ONBOARDING_PENDING_COOKIE,
      value: '',
      url: getBaseUrl(),
      expires: 0,
    },
  ]);
}

async function createIncompleteSingleUserState(page: Page): Promise<void> {
  await signInClerkIncompleteUserE2E(page);

  await page.goto('/auth/bootstrap/start?redirect_url=/users');
  await expect(page).toHaveURL(/\/onboarding\?redirect_url=%2Fusers/);
  await expectOnboardingIncomplete(page);
}

async function createCompletedSingleUserState(page: Page): Promise<void> {
  await signInSingleNewUserE2E(page);

  await page.goto('/auth/bootstrap/start?redirect_url=/users');
  await page.waitForURL(/\/(?:onboarding(?:\?.*)?|users)$/);

  if (getPathname(page.url()) === '/onboarding') {
    await completeOnboarding(page);
  }

  await expect(page).toHaveURL(/\/users$/);
}

async function expectProvisioningReady(
  page: Page,
  expectedTenancyMode: 'single' | 'personal' | 'org',
): Promise<void> {
  const probe = await browserJsonRequest(page, '/api/me/provisioning-status');
  expect(probe.status).toBe(200);

  const probeBody = probe.body as {
    status: string;
    data: {
      tenancyMode: string;
      internalUserId: string;
      internalTenantId: string;
      onboardingComplete: boolean;
    };
  };
  expect(probeBody.status).toBe('ok');
  expect(probeBody.data.tenancyMode).toBe(expectedTenancyMode);
  expect(probeBody.data.internalUserId).toBeTruthy();
  expect(probeBody.data.internalTenantId).toBeTruthy();
  expect(probeBody.data.onboardingComplete).toBe(true);

  const api = await browserJsonRequest(page, '/api/users');
  expect(api.status).toBe(200);
}

async function browserJsonRequest(
  page: Page,
  pathname: string,
): Promise<{ status: number; body: unknown }> {
  return page.evaluate(async (input) => {
    const token = await window.Clerk?.session?.getToken();
    const response = await fetch(input, {
      credentials: 'same-origin',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

    let body: unknown = null;

    try {
      body = await response.json();
    } catch {
      body = null;
    }

    return {
      status: response.status,
      body,
    };
  }, pathname);
}

async function assertNoVisibleRenderingHang(page: Page): Promise<void> {
  await expect(page.locator('body')).not.toContainText(/Rendering\.\.\./i);
}

async function waitForRouteToSettle(page: Page): Promise<void> {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForFunction(() => document.readyState === 'complete');
  await page.waitForTimeout(1_500);
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

async function expectBootstrapOrgRequiredUi(page: Page): Promise<void> {
  await expect(
    page.getByRole('heading', { name: /select or create a workspace/i }),
  ).toBeVisible();
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

    const probe = await browserJsonRequest(page, '/api/me/provisioning-status');
    expect(probe.status).toBe(409);

    const probeBody = probe.body as { code: string };
    expect(probeBody.code).toBe('BOOTSTRAP_REQUIRED');

    await waitForBootstrapRequest(page, async () => {
      await page.goto('/users');
    });
    await expect(page).toHaveURL(/\/onboarding\?redirect_url=%2Fusers/);
  });

  test('single mode: first login goes through bootstrap, reaches onboarding, completes onboarding, then lands on /users @auth-matrix-phase1', async ({
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

    await page.goto('/auth/bootstrap/start?redirect_url=/app/dashboard');
    await expect(page).toHaveURL(
      /\/onboarding\?redirect_url=%2Fapp%2Fdashboard/,
    );
    await completeOnboarding(page);
    await expect(page).toHaveURL(/\/users$/);

    await expect(page.getByText(/user management/i)).toBeVisible();
    await expectProvisioningReady(page, 'single');
  });

  test('single mode: returning login skips onboarding and lands in the app @auth-matrix-phase2', async ({
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

    await createCompletedSingleUserState(page);
    await signOutClerkSession(page);

    await signInSingleNewUserE2E(page);

    await page.goto('/auth/bootstrap/start?redirect_url=/users');
    await expect(page).toHaveURL(/\/users$/);
    await expect(page.getByText(/user management/i)).toBeVisible();
    await expectProvisioningReady(page, 'single');
  });

  test('single mode: returning incomplete user sign-in routes back to onboarding before /users settles @auth-matrix-phase2', async ({
    page,
  }) => {
    test.skip(
      !isSingleRuntime(runtime),
      'Run this scenario with AUTH_PROVIDER=clerk and TENANCY_MODE=single.',
    );
    test.skip(
      !hasClerkIncompleteUserE2ECredentials(),
      'Set E2E_CLERK_INCOMPLETE_USER_USERNAME and E2E_CLERK_INCOMPLETE_USER_PASSWORD.',
    );

    await createIncompleteSingleUserState(page);
    await signOutClerkSession(page);

    await signInClerkIncompleteUserE2E(page);

    await page.goto('/users');

    await expect(page).toHaveURL(/\/onboarding(?:\?.*)?$/);
    await expectOnboardingIncomplete(page);
  });

  test('single mode: direct visit to /users after recreating incomplete state redirects away from /users @auth-matrix-phase2', async ({
    page,
  }) => {
    test.skip(
      !isSingleRuntime(runtime),
      'Run this scenario with AUTH_PROVIDER=clerk and TENANCY_MODE=single.',
    );
    test.skip(
      !hasClerkIncompleteUserE2ECredentials(),
      'Set E2E_CLERK_INCOMPLETE_USER_USERNAME and E2E_CLERK_INCOMPLETE_USER_PASSWORD.',
    );

    await createIncompleteSingleUserState(page);

    await page.goto('/users');

    await expect(page).toHaveURL(/\/onboarding(?:\?.*)?$/);
    await expectOnboardingIncomplete(page);
  });

  test('single mode: direct visit to /users after onboarding completion stays allowed @auth-matrix-phase2', async ({
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

    await createCompletedSingleUserState(page);

    await page.goto('/users');

    await expect(page).toHaveURL(/\/users$/);
    await expect(page.getByText(/user management/i)).toBeVisible();
  });

  test('single mode: direct visit to /onboarding after onboarding completion redirects to /users @auth-matrix-phase2', async ({
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

    await createCompletedSingleUserState(page);

    await page.goto('/onboarding');

    await expect(page).toHaveURL(/\/users$/);
    await expect(page.getByText(/user management/i)).toBeVisible();
  });

  test('single mode: bootstrap start sets onboarding cookie in the route handler before redirecting to onboarding @auth-matrix-phase3', async ({
    page,
  }) => {
    test.skip(
      !isSingleRuntime(runtime),
      'Run this scenario with AUTH_PROVIDER=clerk and TENANCY_MODE=single.',
    );
    test.skip(
      !hasClerkIncompleteUserE2ECredentials(),
      'Set E2E_CLERK_INCOMPLETE_USER_USERNAME and E2E_CLERK_INCOMPLETE_USER_PASSWORD.',
    );

    await signInClerkIncompleteUserE2E(page);

    const bootstrapResponse = await waitForPathResponse(
      page,
      '/auth/bootstrap/start',
      async () => {
        await page.goto('/auth/bootstrap/start?redirect_url=/users');
      },
      (response) =>
        response.request().method() === 'GET' &&
        response.request().resourceType() === 'document' &&
        response.status() >= 300 &&
        response.status() < 400,
    );

    const bootstrapSetCookie =
      (await bootstrapResponse.headerValue('set-cookie')) ??
      bootstrapResponse.headers()['set-cookie'] ??
      '';

    expect(bootstrapSetCookie).toContain(`${ONBOARDING_PENDING_COOKIE}=1`);
    await expect(page).toHaveURL(/\/onboarding\?redirect_url=%2Fusers/);
    await expectCookieValue(page, ONBOARDING_PENDING_COOKIE, '1');
    await expectOnboardingIncomplete(page);
  });

  test('single mode: middleware reads onboarding cookie and redirects a general private route to /onboarding @auth-matrix-phase3', async ({
    page,
  }) => {
    test.skip(
      !isSingleRuntime(runtime),
      'Run this scenario with AUTH_PROVIDER=clerk and TENANCY_MODE=single.',
    );
    test.skip(
      !hasClerkIncompleteUserE2ECredentials(),
      'Set E2E_CLERK_INCOMPLETE_USER_USERNAME and E2E_CLERK_INCOMPLETE_USER_PASSWORD.',
    );

    await createIncompleteSingleUserState(page);
    await expectCookieValue(page, ONBOARDING_PENDING_COOKIE, '1');

    await page.goto('/dashboard');

    await expect(page).toHaveURL(/\/onboarding(?:\?.*)?$/);
    await expectOnboardingIncomplete(page);
  });

  test('single mode: DB incomplete state still routes to onboarding when the onboarding cookie is absent @auth-matrix-phase3', async ({
    page,
  }) => {
    test.skip(
      !isSingleRuntime(runtime),
      'Run this scenario with AUTH_PROVIDER=clerk and TENANCY_MODE=single.',
    );
    test.skip(
      !hasClerkIncompleteUserE2ECredentials(),
      'Set E2E_CLERK_INCOMPLETE_USER_USERNAME and E2E_CLERK_INCOMPLETE_USER_PASSWORD.',
    );

    await createIncompleteSingleUserState(page);
    await clearOnboardingPendingCookie(page);
    await expectCookieAbsent(page, ONBOARDING_PENDING_COOKIE);

    await page.goto('/users');

    await expect(page).toHaveURL(/\/onboarding(?:\?.*)?$/);
    await expectOnboardingIncomplete(page);
  });

  test('single mode: onboarding completion clears the onboarding cookie from a legal server boundary @auth-matrix-phase3', async ({
    page,
  }) => {
    test.skip(
      !isSingleRuntime(runtime),
      'Run this scenario with AUTH_PROVIDER=clerk and TENANCY_MODE=single.',
    );
    test.skip(
      !hasClerkIncompleteUserE2ECredentials(),
      'Set E2E_CLERK_INCOMPLETE_USER_USERNAME and E2E_CLERK_INCOMPLETE_USER_PASSWORD.',
    );

    await signInClerkIncompleteUserE2E(page);
    await page.goto('/auth/bootstrap/start?redirect_url=/users');
    await expect(page).toHaveURL(/\/onboarding\?redirect_url=%2Fusers/);
    await expectCookieValue(page, ONBOARDING_PENDING_COOKIE, '1');

    const submitResponse = await waitForPathResponse(
      page,
      '/onboarding',
      () => completeOnboarding(page),
      (response) => response.request().method() === 'POST',
    );

    expect(submitResponse.request().method()).toBe('POST');

    await expect(page).toHaveURL(/\/users$/);
    await expectCookieAbsent(page, ONBOARDING_PENDING_COOKIE);
    await expectProvisioningReady(page, 'single');
  });

  test('single mode: DB complete state remains authoritative even if the onboarding cookie is stale @auth-matrix-phase3', async ({
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

    await createCompletedSingleUserState(page);
    await expectProvisioningReady(page, 'single');
    await setOnboardingPendingCookie(page);
    await expectCookieValue(page, ONBOARDING_PENDING_COOKIE, '1');

    await page.goto('/users');

    await expect(page).toHaveURL(/\/users$/);
    await expect(page.getByText(/user management/i)).toBeVisible();
    await expectProvisioningReady(page, 'single');
  });

  test('single mode: root layout stays stable on the public home route under Clerk provider shell @auth-matrix-phase4', async ({
    page,
  }) => {
    test.skip(
      !isSingleRuntime(runtime),
      'Run this scenario with AUTH_PROVIDER=clerk and TENANCY_MODE=single.',
    );

    const runtimeSignals = createRuntimeSignalRecorder(page);

    await page.goto('/');

    await expect(page).toHaveTitle(
      /Next\.js 16 Boilerplate \| Build Your Next Idea Faster/i,
    );
    await expect(
      page.getByRole('link', { name: /documentation/i }),
    ).toBeVisible();
    await waitForRouteToSettle(page);
    await assertNoVisibleRenderingHang(page);
    runtimeSignals.assertNoPhase4Failures();
  });

  test('single mode: completed-user /users load stays stable in the Clerk provider branch @auth-matrix-phase4', async ({
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

    await createCompletedSingleUserState(page);

    const runtimeSignals = createRuntimeSignalRecorder(page);

    await page.goto('/users');

    await expect(page).toHaveURL(/\/users$/);
    await expect(page.getByText(/user management/i)).toBeVisible();
    await waitForRouteToSettle(page);
    await assertNoVisibleRenderingHang(page);
    runtimeSignals.assertNoPhase4Failures();
  });

  test('single mode: returning completed user does not race from /users back to /onboarding after bootstrap redirect @auth-matrix-phase4', async ({
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

    await createCompletedSingleUserState(page);
    await signOutClerkSession(page);

    const runtimeSignals = createRuntimeSignalRecorder(page);

    await signInSingleNewUserE2E(page);
    await page.goto('/auth/bootstrap/start?redirect_url=/users');

    await expect(page).toHaveURL(/\/users$/);
    await expect(page.getByText(/user management/i)).toBeVisible();
    await waitForRouteToSettle(page);
    await assertNoVisibleRenderingHang(page);
    expect(
      runtimeSignals.transitions.some((transition) =>
        transition.startsWith('/onboarding'),
      ),
    ).toBe(false);
    runtimeSignals.assertNoPhase4Failures();
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

    await page.goto('/auth/bootstrap/start?redirect_url=/users');
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

    await page.goto('/auth/bootstrap/start?redirect_url=/users');
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

    await page.goto('/auth/bootstrap/start?redirect_url=/users');
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

    await page.goto('/auth/bootstrap/start?redirect_url=/users');
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

    await page.goto('/auth/bootstrap/start?redirect_url=/users');
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

    await page.goto('/auth/bootstrap/start?redirect_url=/users');
    await expect(page).toHaveURL(/\/onboarding\?redirect_url=%2Fusers/);
    await completeOnboarding(page);
    await expect(page).toHaveURL(/\/users$/);
    await expectProvisioningReady(page, 'org');
  });

  test('org/provider mode without an active org renders the workspace recovery UI', async ({
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

    await page.goto('/auth/bootstrap/start?redirect_url=/users');
    await expectBootstrapOrgRequiredUi(page);
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

    await page.goto('/auth/bootstrap/start?redirect_url=/users');
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

    await page.goto('/auth/bootstrap/start?redirect_url=/users');
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

    const response = await browserJsonRequest(page, '/api/users');
    expect(response.status).toBe(403);

    const body = response.body as { code: string };
    expect(body.code).toBe('TENANT_MEMBERSHIP_REQUIRED');
  });

  test('OAuth sign-in entry that creates a brand-new user lands on /auth/bootstrap/start', async ({
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

  test('OAuth sign-up entry lands on /auth/bootstrap/start', async ({
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

    await clerkUi.signUp.goTo();
    await waitForBootstrapRequest(page, async () => {
      await clerkUi.signUp.signUpWithOauth(runtime.oauthProvider!).click();
    });
  });
});
