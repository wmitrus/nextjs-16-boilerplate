import { clerk, setupClerkTestingToken } from '@clerk/testing/playwright';
import type { Page } from '@playwright/test';

function required(value: string | undefined, variableName: string): string {
  if (!value) {
    throw new Error(
      `Missing ${variableName}. Set it in your environment for Clerk-authenticated E2E tests.`,
    );
  }

  return value;
}

export function hasClerkE2ECredentials(): boolean {
  return Boolean(
    process.env.E2E_CLERK_USER_USERNAME && process.env.E2E_CLERK_USER_PASSWORD,
  );
}

export async function signInE2E(page: Page): Promise<void> {
  await setupClerkTestingToken({ page });

  await page.goto('/');

  await clerk.signIn({
    page,
    signInParams: {
      strategy: 'password',
      identifier: required(
        process.env.E2E_CLERK_USER_USERNAME,
        'E2E_CLERK_USER_USERNAME',
      ),
      password: required(
        process.env.E2E_CLERK_USER_PASSWORD,
        'E2E_CLERK_USER_PASSWORD',
      ),
    },
  });

  await clerk.loaded({ page });
}

export async function withClerkTestingToken(page: Page): Promise<void> {
  await setupClerkTestingToken({ page });
}
