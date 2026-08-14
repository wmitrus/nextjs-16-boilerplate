import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_TEST_BASE_URL;
const protectionBypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

if (!baseURL) {
  throw new Error('PLAYWRIGHT_TEST_BASE_URL is required for the Vercel smoke.');
}

export default defineConfig({
  testDir: './e2e',
  testMatch: 'vercel-runtime-smoke.spec.ts',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  reporter: 'line',
  use: {
    baseURL,
    extraHTTPHeaders: protectionBypass
      ? {
          'x-vercel-protection-bypass': protectionBypass,
          'x-vercel-set-bypass-cookie': 'true',
        }
      : undefined,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
