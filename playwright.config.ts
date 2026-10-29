import { defineConfig, devices } from '@playwright/test';

import { resolveInternalApiKey } from './e2e/internal-api-key';
import {
  assertE2EServerIsolatedFromProductionServices,
  e2eIsolatedEnv,
  resolveE2EBaseURL,
} from './e2e/production-service-guard';

function parseBoolean(value: string | undefined): boolean | undefined {
  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  return undefined;
}

const baseURL = resolveE2EBaseURL(process.env);
const resolvedBaseURL = new URL(baseURL);
const basePort =
  resolvedBaseURL.port ||
  (resolvedBaseURL.protocol === 'https:' ? '443' : '80');
const captureServerLogs =
  parseBoolean(process.env.PLAYWRIGHT_CAPTURE_SERVER_LOGS) ?? true;
const serverLogDir =
  process.env.PLAYWRIGHT_SERVER_LOG_DIR ?? 'logs/playwright/server';
const hasExplicitServerLogDir =
  typeof process.env.PLAYWRIGHT_SERVER_LOG_DIR === 'string' &&
  process.env.PLAYWRIGHT_SERVER_LOG_DIR.trim().length > 0;
// OZI-219: never reuse a server this config did not start -- its env (and
// so its Sentry/Upstash isolation) cannot be verified. A busy port fails.
const reuseExistingServer = false;
const serveBuild = Boolean(process.env.CI);

// OZI-219: outbound-service keys pinned empty and NEXT_PUBLIC_APP_URL pinned
// to this (loopback-only) base URL -- `.env.local` / `.env.production*` can
// never point the E2E server at production services.
const webServerEnv = e2eIsolatedEnv(
  {
    ...process.env,
    PORT: basePort,
    E2E_ENABLED: process.env.E2E_ENABLED ?? 'true',
    INTERNAL_API_KEY: resolveInternalApiKey(process.env),
    LOG_DIR: hasExplicitServerLogDir
      ? serverLogDir
      : (process.env.LOG_DIR ?? serverLogDir),
    LOG_TO_FILE_DEV:
      process.env.LOG_TO_FILE_DEV ?? (captureServerLogs ? 'true' : 'false'),
    LOG_TO_FILE_PROD:
      process.env.LOG_TO_FILE_PROD ?? (captureServerLogs ? 'true' : 'false'),
    NEXT_DISABLE_DEV_OVERLAY: '1',
    NEXT_PUBLIC_E2E_ENABLED: process.env.NEXT_PUBLIC_E2E_ENABLED ?? 'true',
  },
  baseURL,
);

// Fail closed before any web server starts.
assertE2EServerIsolatedFromProductionServices(webServerEnv, {
  dir: process.cwd(),
  serveBuild,
});

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
  workers: process.env.CI ? 1 : 16,
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
    command: serveBuild ? 'pnpm start' : 'pnpm dev',
    url: baseURL,
    reuseExistingServer,
    stdout: 'ignore',
    stderr: 'ignore',
    timeout: 120000,
    env: webServerEnv,
  },
});
