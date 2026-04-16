import { fileURLToPath } from 'node:url';

import {
  validateAuthProviderConfigValues,
  validateNewRelicConfigValues,
  validateTenancyConfigValues,
} from '@/core/env';

import { loadedFiles } from './load-env-files';

export function runValidation(
  authProvider: string | undefined,
  clerkSecretKey: string | undefined,
  clerkPublishableKey: string | undefined,
  tenancyMode: string | undefined,
  defaultTenantId: string | undefined,
  tenantContextSource: string | undefined,
  newRelicEnabled: boolean | string | undefined,
  newRelicLicenseKey: string | undefined,
  nodeOptions: string | undefined,
  nodeEnv: string | undefined,
): string[] {
  const errors: string[] = [];

  try {
    validateAuthProviderConfigValues(
      authProvider,
      clerkSecretKey,
      clerkPublishableKey,
    );
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  try {
    validateTenancyConfigValues(
      tenancyMode,
      defaultTenantId,
      tenantContextSource,
    );
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  try {
    validateNewRelicConfigValues(
      newRelicEnabled,
      newRelicLicenseKey,
      nodeOptions,
      nodeEnv,
    );
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  return errors;
}

function main(): void {
  const source =
    loadedFiles.length > 0
      ? `loaded from: ${loadedFiles.join(', ')}`
      : 'no local .env files found — reading from process.env only (expected in CI after vercel pull)';

  // Read from process.env directly — T3-Env proxy caches values at module init time
  // and may have stale undefined for optional fields when .env.local is loaded after.
  // By the time main() runs, load-env-files has already populated process.env.
  const authProvider = process.env.AUTH_PROVIDER ?? 'clerk';
  const tenancyMode = process.env.TENANCY_MODE ?? 'single';

  const errors = runValidation(
    authProvider,
    process.env.CLERK_SECRET_KEY,
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    tenancyMode,
    process.env.DEFAULT_TENANT_ID,
    process.env.TENANT_CONTEXT_SOURCE,
    process.env.NEW_RELIC_ENABLED,
    process.env.NEW_RELIC_LICENSE_KEY,
    process.env.NODE_OPTIONS,
    process.env.NODE_ENV,
  );

  if (errors.length > 0) {
    console.error(
      `❌ Environment validation failed (${source}).\nThe following cross-field requirements are not met:`,
    );
    for (const error of errors) {
      console.error(`   ${error}`);
    }
    console.error(
      '\nFix these configuration issues before deploying. See docs/sdd/ for deployment guides.',
    );
    process.exit(1);
  }

  console.log(
    `✅ Environment cross-field validation passed (${source})\n   NODE_ENV=${process.env.NODE_ENV ?? 'development'}, AUTH_PROVIDER=${authProvider}, TENANCY_MODE=${tenancyMode}`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
