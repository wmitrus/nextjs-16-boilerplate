import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
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
      NEXT_PUBLIC_E2E_ENABLED: 'true',
      NEXT_DISABLE_DEV_OVERLAY: '1',
    },
  },
});
