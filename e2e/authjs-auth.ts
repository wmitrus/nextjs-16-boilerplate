import type { APIRequestContext, Browser, Page } from '@playwright/test';
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

const AUTHJS_SIGN_IN_TIMEOUT_MS = 30_000;
const AUTHJS_PROVISIONING_ROUTE = '/api/internal/e2e/authjs-user';
const AUTHJS_PROVISIONING_ROUTE_READY_TIMEOUT_MS = 15_000;
const AUTHJS_PROVISIONING_ROUTE_READY_POLL_MS = 250;

const authjsProvisioningRouteReadyByRequest = new WeakMap<
  APIRequestContext,
  Promise<void>
>();

export type AuthjsE2ECredentials = z.infer<typeof authjsCredentialsSchema>;

type AuthjsE2EProvisioningOptions = {
  onboardingComplete?: boolean;
};

function getInternalApiHeaders(): Record<string, string> {
  return {
    'x-internal-key': resolveInternalApiKey(),
  };
}

function isRouteCompilationHtmlResponse(
  status: number,
  contentType: string | undefined,
  body: string,
): boolean {
  return (
    status === 404 &&
    (contentType?.includes('text/html') === true ||
      body.includes('<!DOCTYPE html') ||
      body.includes('__next_error__'))
  );
}

function isReadyProbeSuccess(
  status: number,
  contentType: string | undefined,
  body: string,
): boolean {
  return (
    status === 400 &&
    contentType?.includes('application/json') === true &&
    body.includes('Invalid request body')
  );
}

async function waitFor(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForAuthjsProvisioningRouteReady(
  request: APIRequestContext,
): Promise<void> {
  const existing = authjsProvisioningRouteReadyByRequest.get(request);
  if (existing) {
    await existing;
    return;
  }

  const readinessPromise = (async () => {
    const deadline = Date.now() + AUTHJS_PROVISIONING_ROUTE_READY_TIMEOUT_MS;
    let lastProbeSummary = 'no probe attempt recorded';

    while (Date.now() < deadline) {
      // Next.js dev can serve an app-level 404 while this route is still being compiled.
      const response = await request.post(AUTHJS_PROVISIONING_ROUTE, {
        headers: getInternalApiHeaders(),
        data: {},
      });
      const body = await response.text();
      const contentType = response.headers()['content-type'];

      if (isReadyProbeSuccess(response.status(), contentType, body)) {
        return;
      }

      if (
        isRouteCompilationHtmlResponse(response.status(), contentType, body)
      ) {
        lastProbeSummary = `${response.status()} ${contentType ?? 'unknown-content-type'} route still compiling`;
        await waitFor(AUTHJS_PROVISIONING_ROUTE_READY_POLL_MS);
        continue;
      }

      throw new Error(
        `AuthJS provisioning route readiness probe failed: ${response.status()} ${body}`,
      );
    }

    throw new Error(
      `AuthJS provisioning route did not become ready within ${AUTHJS_PROVISIONING_ROUTE_READY_TIMEOUT_MS}ms. Last probe: ${lastProbeSummary}`,
    );
  })();

  authjsProvisioningRouteReadyByRequest.set(request, readinessPromise);

  try {
    await readinessPromise;
  } catch (error) {
    authjsProvisioningRouteReadyByRequest.delete(request);
    throw error;
  }
}

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
  await waitForAuthjsProvisioningRouteReady(request);

  const response = await request.post(AUTHJS_PROVISIONING_ROUTE, {
    headers: getInternalApiHeaders(),
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
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith('/auth/'), {
      timeout: AUTHJS_SIGN_IN_TIMEOUT_MS,
      waitUntil: 'domcontentloaded',
    }),
    page.click('button[type="submit"]'),
  ]);
}

export async function captureAuthjsSessionStorageState(
  browser: Browser,
  credentials: AuthjsE2ECredentials,
): Promise<Awaited<ReturnType<Browser['newContext']>['storageState']>> {
  const context = await browser.newContext();

  try {
    const page = await context.newPage();
    await signInAuthjsE2E(page, credentials);
    return await context.storageState();
  } finally {
    await context.close().catch(() => undefined);
  }
}
