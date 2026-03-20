import { createPageObjects } from '@clerk/testing/playwright/unstable';
import { test, expect, type Page, type Request } from '@playwright/test';

import {
  getClerkE2ECredentials,
  hasClerkSingleProvisionedUserE2ECredentials,
} from './clerk-auth';

const SIGN_UP_PASSWORD = 'E2E-Password-123!';

function createUniqueClerkTestEmail(prefix: string): string {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return `e2e+clerk_test-${prefix}-${suffix}@example.com`;
}

function getBaseUrl(): string {
  return process.env.PLAYWRIGHT_TEST_BASE_URL ?? 'http://localhost:3000';
}

function isBootstrapNavigationRequest(request: Request): boolean {
  return new URL(request.url()).pathname === '/auth/bootstrap/start';
}

async function waitForBootstrapNavigation(
  page: Page,
  action: () => Promise<void>,
): Promise<void> {
  const bootstrapRequest = page.waitForRequest(isBootstrapNavigationRequest);

  await action();
  await bootstrapRequest;
}

async function completeHostedSignUpVerificationIfNeeded(
  page: Page,
  signUp: ReturnType<typeof createPageObjects>['signUp'],
): Promise<void> {
  const nextStep = await Promise.race<'bootstrap' | 'verify-email'>([
    page
      .waitForRequest(isBootstrapNavigationRequest)
      .then(() => 'bootstrap' as const),
    signUp.waitForEmailVerificationScreen().then(() => 'verify-email' as const),
  ]);

  if (nextStep === 'verify-email') {
    await signUp.enterTestOtpCode();
  }
}

test.describe('Authentication E2E', () => {
  test.describe.configure({ mode: 'serial' });

  test('shows signed-out auth entry buttons on the home page', async ({
    page,
  }) => {
    const clerkUi = createPageObjects({
      page,
      baseURL: getBaseUrl(),
    });

    await clerkUi.page.goToAppHome();

    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /sign up/i })).toBeVisible();
  });

  test('sign-in via /sign-in page force redirects through /auth/bootstrap/start', async ({
    page,
  }) => {
    test.skip(
      !hasClerkSingleProvisionedUserE2ECredentials(),
      'Set E2E_CLERK_SINGLE_PROVISIONED_USER_USERNAME and E2E_CLERK_SINGLE_PROVISIONED_USER_PASSWORD.',
    );

    const clerkUi = createPageObjects({
      page,
      baseURL: getBaseUrl(),
    });
    const credentials = getClerkE2ECredentials('singleProvisionedUser');

    await clerkUi.signIn.goTo();
    await waitForBootstrapNavigation(page, async () => {
      await clerkUi.signIn.signInWithEmailAndInstantPassword({
        email: credentials.username,
        password: credentials.password,
        waitForSession: false,
      });
    });
  });

  test('sign-up via /sign-up page force redirects through /auth/bootstrap/start', async ({
    page,
  }) => {
    const clerkUi = createPageObjects({
      page,
      baseURL: getBaseUrl(),
    });
    const email = createUniqueClerkTestEmail('page-sign-up');

    await clerkUi.signUp.goTo();
    await waitForBootstrapNavigation(page, async () => {
      await clerkUi.signUp.signUpWithEmailAndPassword({
        email,
        password: SIGN_UP_PASSWORD,
      });
      await completeHostedSignUpVerificationIfNeeded(page, clerkUi.signUp);
    });
  });

  test('sign-in via header modal force redirects through /auth/bootstrap/start', async ({
    page,
  }) => {
    test.skip(
      !hasClerkSingleProvisionedUserE2ECredentials(),
      'Set E2E_CLERK_SINGLE_PROVISIONED_USER_USERNAME and E2E_CLERK_SINGLE_PROVISIONED_USER_PASSWORD.',
    );

    const clerkUi = createPageObjects({
      page,
      baseURL: getBaseUrl(),
    });
    const credentials = getClerkE2ECredentials('singleProvisionedUser');

    await clerkUi.page.goToAppHome();
    await page.getByRole('button', { name: /^sign in$/i }).click();
    await clerkUi.signIn.waitForModal('open');

    await waitForBootstrapNavigation(page, async () => {
      await clerkUi.signIn.signInWithEmailAndInstantPassword({
        email: credentials.username,
        password: credentials.password,
        waitForSession: false,
      });
    });
  });

  test('sign-up via header modal force redirects through /auth/bootstrap/start', async ({
    page,
  }) => {
    const clerkUi = createPageObjects({
      page,
      baseURL: getBaseUrl(),
    });
    const email = createUniqueClerkTestEmail('modal-sign-up');

    await clerkUi.page.goToAppHome();
    await page.getByRole('button', { name: /^sign up$/i }).click();
    await clerkUi.signUp.waitForModal('open');

    await waitForBootstrapNavigation(page, async () => {
      await clerkUi.signUp.signUpWithEmailAndPassword({
        email,
        password: SIGN_UP_PASSWORD,
      });
      await completeHostedSignUpVerificationIfNeeded(page, clerkUi.signUp);
    });
  });

  test('switching sign-in -> sign-up inside Clerk page UI still ends at /auth/bootstrap/start', async ({
    page,
  }) => {
    const clerkUi = createPageObjects({
      page,
      baseURL: getBaseUrl(),
    });
    const email = createUniqueClerkTestEmail('page-switch-sign-up');

    await clerkUi.signIn.goTo();
    await clerkUi.signIn.getGoToSignUp().click();
    await clerkUi.signUp.waitForMounted();

    await waitForBootstrapNavigation(page, async () => {
      await clerkUi.signUp.signUpWithEmailAndPassword({
        email,
        password: SIGN_UP_PASSWORD,
      });
      await completeHostedSignUpVerificationIfNeeded(page, clerkUi.signUp);
    });
  });

  test('switching sign-up -> sign-in inside Clerk modal UI still ends at /auth/bootstrap/start', async ({
    page,
  }) => {
    test.skip(
      !hasClerkSingleProvisionedUserE2ECredentials(),
      'Set E2E_CLERK_SINGLE_PROVISIONED_USER_USERNAME and E2E_CLERK_SINGLE_PROVISIONED_USER_PASSWORD.',
    );

    const clerkUi = createPageObjects({
      page,
      baseURL: getBaseUrl(),
    });
    const credentials = getClerkE2ECredentials('singleProvisionedUser');

    await clerkUi.page.goToAppHome();
    await page.getByRole('button', { name: /^sign up$/i }).click();
    await clerkUi.signUp.waitForModal('open');
    await page
      .locator('.cl-signUp-root')
      .getByRole('link', { name: /sign in/i })
      .click();
    await clerkUi.signIn.waitForModal('open');

    await waitForBootstrapNavigation(page, async () => {
      await clerkUi.signIn.signInWithEmailAndInstantPassword({
        email: credentials.username,
        password: credentials.password,
        waitForSession: false,
      });
    });
  });
});
