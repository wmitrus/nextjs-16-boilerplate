import { clerkSetup } from '@clerk/testing/playwright';

import { readEnvFileRecord, resolveProjectPath } from './env-files';

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
  await clerkSetup();
}

export default globalSetup;
