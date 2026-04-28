import type { APIRequestContext, Page } from '@playwright/test';
import { z } from 'zod';

import { readEnvFileMap, resolveProjectPath } from './env-files';
import { resolveInternalApiKey } from './internal-api-key';
import { getRuntimeProfile } from './runtime-profile';

const profile = getRuntimeProfile();
const authjsCredentialsSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
});

const authjsProvisioningSchema = authjsCredentialsSchema.extend({
  onboardingComplete: z.boolean().default(true),
});

export type AuthjsE2ECredentials = z.infer<typeof authjsCredentialsSchema>;

type AuthjsE2EProvisioningOptions = {
  onboardingComplete?: boolean;
};

export function createAuthjsE2ECredentials(
  prefix: string,
): AuthjsE2ECredentials {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  return {
    email: `e2e+authjs-${prefix}-${suffix}@example.com`,
    password: 'E2E-Password-123!',
  };
}

function readFromEnvFiles(name: string): string | undefined {
  try {
    const envLocal = readEnvFileMap(
      resolveProjectPath('.env.local'),
      '.env.local',
    );
    const val = envLocal.get(name);
    if (val?.trim()) return val.trim();
  } catch {
    // file not found is acceptable
  }

  return undefined;
}

export function isAuthjsRuntime(): boolean {
  return profile.authProvider === 'authjs';
}

export function hasAuthjsE2ECredentials(): boolean {
  const email =
    process.env.E2E_AUTHJS_USER_EMAIL ??
    readFromEnvFiles('E2E_AUTHJS_USER_EMAIL');
  const password =
    process.env.E2E_AUTHJS_USER_PASSWORD ??
    readFromEnvFiles('E2E_AUTHJS_USER_PASSWORD');
  return Boolean(email?.trim() && password?.trim());
}

export function getAuthjsE2ECredentials(): {
  email: string;
  password: string;
} | null {
  const email =
    process.env.E2E_AUTHJS_USER_EMAIL ??
    readFromEnvFiles('E2E_AUTHJS_USER_EMAIL');
  const password =
    process.env.E2E_AUTHJS_USER_PASSWORD ??
    readFromEnvFiles('E2E_AUTHJS_USER_PASSWORD');
  if (!email?.trim() || !password?.trim()) return null;
  return { email: email.trim(), password: password.trim() };
}

export async function provisionAuthjsE2EUser(
  request: APIRequestContext,
  credentials: AuthjsE2ECredentials,
  options?: AuthjsE2EProvisioningOptions,
): Promise<void> {
  const parsed = authjsProvisioningSchema.parse({
    ...credentials,
    onboardingComplete: options?.onboardingComplete ?? true,
  });
  const response = await request.post('/api/internal/e2e/authjs-user', {
    headers: {
      'x-internal-key': resolveInternalApiKey(),
    },
    data: parsed,
  });

  if (response.ok()) {
    return;
  }

  throw new Error(
    `Failed to provision AuthJS E2E user: ${response.status()} ${await response.text()}`,
  );
}

export async function signInAuthjsE2E(
  page: Page,
  explicitCredentials?: AuthjsE2ECredentials,
): Promise<void> {
  const credentials = explicitCredentials ?? getAuthjsE2ECredentials();
  if (!credentials) {
    throw new Error(
      'E2E_AUTHJS_USER_EMAIL and E2E_AUTHJS_USER_PASSWORD must be set for authjs E2E tests',
    );
  }

  const parsed = authjsCredentialsSchema.parse(credentials);

  await page.goto('/auth/signin');
  await page.fill('input[type="email"]', parsed.email);
  await page.fill('input[type="password"]', parsed.password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith('/auth/'), {
    timeout: 10000,
  });
}
