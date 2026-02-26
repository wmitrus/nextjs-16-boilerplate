import fs from 'node:fs';
import path from 'node:path';

import { clerkSetup } from '@clerk/testing/playwright';

function readEnvFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const env: Record<string, string> = {};

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const equalsIndex = line.indexOf('=');
    if (equalsIndex === -1) {
      continue;
    }

    const key = line.slice(0, equalsIndex).trim();
    const value = line.slice(equalsIndex + 1).trim();

    env[key] = value.replace(/^['"]|['"]$/g, '');
  }

  return env;
}

function ensureClerkTestingEnv(): void {
  const envLocal = readEnvFile(path.resolve(process.cwd(), '.env.local'));
  const envExample = readEnvFile(path.resolve(process.cwd(), '.env.example'));

  process.env.CLERK_SECRET_KEY =
    process.env.CLERK_SECRET_KEY ?? envLocal.CLERK_SECRET_KEY ?? '';

  process.env.CLERK_PUBLISHABLE_KEY =
    process.env.CLERK_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ??
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
