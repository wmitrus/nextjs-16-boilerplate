import { defineConfig, devices } from '@playwright/test';

function parseBoolean(value: string | undefined): boolean | undefined {
  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  return undefined;
}

const baseURL = process.env.PLAYWRIGHT_TEST_BASE_URL ?? 'http://localhost:3000';
const reuseExistingServer =
  parseBoolean(process.env.PLAYWRIGHT_REUSE_EXISTING_SERVER) ?? !process.env.CI;

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global.setup.ts',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: 'html',
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL,

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    command: process.env.CI ? 'pnpm start' : 'pnpm dev',
    url: baseURL,
    reuseExistingServer,
    stdout: 'ignore',
    stderr: 'ignore',
    timeout: 120000,
    env: {
      ...process.env,
      PORT: '3000',
      E2E_ENABLED: process.env.E2E_ENABLED ?? 'true',
      INTERNAL_API_KEY: 'demo-internal-key',
      NEXT_DISABLE_DEV_OVERLAY: '1',
      NEXT_PUBLIC_E2E_ENABLED: process.env.NEXT_PUBLIC_E2E_ENABLED ?? 'true',
    },
  },
});
