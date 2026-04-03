import { fileURLToPath } from 'node:url';

import {
  env,
  validateAuthProviderConfigValues,
  validateTenancyConfigValues,
} from '@/core/env';

export function runValidation(
  authProvider: string | undefined,
  clerkSecretKey: string | undefined,
  clerkPublishableKey: string | undefined,
  tenancyMode: string | undefined,
  defaultTenantId: string | undefined,
  tenantContextSource: string | undefined,
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

  return errors;
}

function main(): void {
  const errors = runValidation(
    env.AUTH_PROVIDER,
    env.CLERK_SECRET_KEY,
    env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    env.TENANCY_MODE,
    env.DEFAULT_TENANT_ID,
    env.TENANT_CONTEXT_SOURCE,
  );

  if (errors.length > 0) {
    console.error(
      '❌ Environment validation failed. The following cross-field requirements are not met:',
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
    `✅ Environment cross-field validation passed (NODE_ENV=${env.NODE_ENV}, AUTH_PROVIDER=${env.AUTH_PROVIDER}, TENANCY_MODE=${env.TENANCY_MODE})`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
