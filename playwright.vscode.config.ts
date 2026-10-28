import { defineConfig, devices } from '@playwright/test';

import { resolveInternalApiKey } from './e2e/internal-api-key';
import {
  assertE2EServerIsolatedFromProductionServices,
  e2eIsolatedEnv,
} from './e2e/production-service-guard';

const baseURL = 'http://localhost:3000';

// OZI-219: never production services (see playwright.config.ts).
const webServerEnv = e2eIsolatedEnv(
  {
    PORT: '3000',
    E2E_ENABLED: 'true',
    INTERNAL_API_KEY: resolveInternalApiKey(process.env),
    NEXT_PUBLIC_E2E_ENABLED: 'true',
    NEXT_DISABLE_DEV_OVERLAY: '1',
  },
  baseURL,
);

// Playwright layers `env` over process.env for the web server.
assertE2EServerIsolatedFromProductionServices(
  { ...process.env, ...webServerEnv },
  { dir: process.cwd(), serveBuild: false },
);

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global.setup.ts',
  reporter: 'line',
  workers: 16,
  use: {
    baseURL,
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command: 'pnpm dev',
    url: baseURL,
    // OZI-219: an already-running server's env cannot be verified.
    reuseExistingServer: false,
    timeout: 120000,
    env: webServerEnv,
  },
});
