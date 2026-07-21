import { clerkSetup } from '@clerk/testing/playwright';

import { readEnvFileRecord, resolveProjectPath } from './env-files';

const CLERK_SETUP_MAX_ATTEMPTS = 3;
const CLERK_SETUP_RETRY_DELAY_MS = 1_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function describeUnknownError(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error);
  }

  const maybeApiError = error as Error & {
    readonly status?: number;
    readonly statusCode?: number;
    readonly errors?: ReadonlyArray<{
      readonly code?: string;
      readonly message?: string;
    }>;
  };
  const details = [];

  if (error.name) {
    details.push(error.name);
  }

  if (error.message) {
    details.push(error.message);
  }

  if (typeof maybeApiError.status === 'number') {
    details.push(`status=${maybeApiError.status}`);
  }

  if (typeof maybeApiError.statusCode === 'number') {
    details.push(`statusCode=${maybeApiError.statusCode}`);
  }

  if (Array.isArray(maybeApiError.errors)) {
    const clerkErrors = maybeApiError.errors
      .map((entry) =>
        [entry.code, entry.message]
          .filter((value): value is string => typeof value === 'string')
          .join(': '),
      )
      .filter((value) => value.length > 0);

    if (clerkErrors.length > 0) {
      details.push(clerkErrors.join('; '));
    }
  }

  return details.length > 0 ? details.join(' - ') : 'unknown error';
}

async function setupClerkTestingTokenWithRetry(): Promise<void> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= CLERK_SETUP_MAX_ATTEMPTS; attempt += 1) {
    try {
      await clerkSetup();
      return;
    } catch (error) {
      lastError = error;

      if (attempt < CLERK_SETUP_MAX_ATTEMPTS) {
        await sleep(CLERK_SETUP_RETRY_DELAY_MS);
      }
    }
  }

  throw new Error(
    `Failed to fetch Clerk testing token after ${CLERK_SETUP_MAX_ATTEMPTS} attempts: ${describeUnknownError(lastError)}`,
  );
}

function readEnvFile(filePath: string): Record<string, string> {
  return readEnvFileRecord(filePath, `global setup env file: ${filePath}`);
}

function ensureClerkTestingEnv(): void {
  const envE2ELocal = readEnvFile(resolveProjectPath('.env.e2e.local'));
  const envE2E = readEnvFile(resolveProjectPath('.env.e2e'));
  const envLocal = readEnvFile(resolveProjectPath('.env.local'));
  const envExample = readEnvFile(resolveProjectPath('.env.example'));

  process.env.CLERK_SECRET_KEY =
    process.env.CLERK_SECRET_KEY ??
    envE2ELocal.CLERK_SECRET_KEY ??
    envE2E.CLERK_SECRET_KEY ??
    envLocal.CLERK_SECRET_KEY ??
    '';

  process.env.CLERK_PUBLISHABLE_KEY =
    process.env.CLERK_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ??
    envE2ELocal.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ??
    envE2E.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ??
    envLocal.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ??
    envExample.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ??
    '';

  if (!process.env.CLERK_SECRET_KEY || !process.env.CLERK_PUBLISHABLE_KEY) {
    throw new Error(
      'Missing Clerk keys for Playwright testing. Set CLERK_SECRET_KEY and NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY (or CLERK_PUBLISHABLE_KEY).',
    );
  }
}

async function globalSetup() {
  ensureClerkTestingEnv();
  await setupClerkTestingTokenWithRetry();
}

export default globalSetup;
