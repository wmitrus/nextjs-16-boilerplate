import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global.setup.ts',
  reporter: 'line',
  use: {
    baseURL: 'http://localhost:3000',
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 120000,
    env: {
      PORT: '3000',
      E2E_ENABLED: 'true',
      INTERNAL_API_KEY: 'demo-internal-key',
      NEXT_PUBLIC_E2E_ENABLED: 'true',
      NEXT_DISABLE_DEV_OVERLAY: '1',
    },
  },
});
