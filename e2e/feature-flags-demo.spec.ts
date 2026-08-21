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
const isDemoShowcaseEnabled = process.env.DEMO_SHOWCASE_ENABLED === 'true';
const baseURL = process.env.PLAYWRIGHT_TEST_BASE_URL ?? 'http://localhost:3100';
type SessionStorageState = Awaited<ReturnType<BrowserContext['storageState']>>;

const authTest = base.extend<
  { authedPage: Page },
  { authRequest: APIRequestContext; demoStorageState: SessionStorageState }
>({
  authRequest: [
    async ({ playwright }, runWithRequest) => {
      const request = await playwright.request.newContext({ baseURL });
      await runWithRequest(request);
      await request.dispose();
    },
    { scope: 'worker' },
  ],
  demoStorageState: [
    async ({ browser, authRequest }, runWithStorageState) => {
      const credentials = createAuthjsE2ECredentials('demo-showcase');
      await provisionAuthjsE2EUser(authRequest, credentials);
      const storageState = await captureAuthjsSessionStorageState(
        browser,
        credentials,
      );
      await runWithStorageState(storageState);
    },
    { scope: 'worker' },
  ],
  authedPage: async ({ browser, demoStorageState }, runWithPage) => {
    const context = await browser.newContext({
      storageState: demoStorageState,
    });
    const page = await context.newPage();
    await runWithPage(page);
    await context.close();
  },
});

// DEMO_SHOWCASE_ENABLED is off by default (see SEC-29 in
// docs/ai/general/SECURITY_CODING_PATTERNS.md) — this whole positive-path
// suite only runs when a scenario deliberately turns it on, e.g.
// `pnpm e2e:demo-showcase`. The default-off 404 behavior is covered
// unconditionally by e2e/security.spec.ts instead.
authTest.describe(
  'Feature Flags Demo Page E2E (DEMO_SHOWCASE_ENABLED=true)',
  () => {
    authTest.skip(
      !isDemoShowcaseEnabled || !isAuthjs,
      'Run via `pnpm e2e:demo-showcase` (sets DEMO_SHOWCASE_ENABLED=true and AUTH_PROVIDER=authjs).',
    );

    authTest.beforeEach(async ({ authedPage }) => {
      await authedPage.goto('/feature-flags-demo');
    });

    authTest('should load without error boundary', async ({ authedPage }) => {
      await expect(
        authedPage.getByRole('heading', { name: /feature flags showcase/i }),
      ).toBeVisible();

      await expect(
        authedPage.getByText(/something went wrong/i),
      ).not.toBeVisible();
    });

    authTest('should have the correct page title', async ({ authedPage }) => {
      await expect(authedPage).toHaveTitle(/Feature Flags Demo/i);
    });

    authTest('should show the active provider name', async ({ authedPage }) => {
      await expect(
        authedPage.getByText(/flags resolved server-side from the/i),
      ).toBeVisible();
    });

    authTest(
      'should display at least one feature flag status card',
      async ({ authedPage }) => {
        const cards = authedPage.getByText(/demo\./);
        await expect(cards.first()).toBeVisible();
      },
    );

    authTest(
      'should show the adapter switching instructions section',
      async ({ authedPage }) => {
        await expect(
          authedPage.getByRole('heading', { name: /how to switch adapters/i }),
        ).toBeVisible();
      },
    );
  },
);
