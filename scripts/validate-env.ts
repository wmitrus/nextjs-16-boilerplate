import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  validateAuthProviderConfigValues,
  validateNewRelicConfigValues,
  validateTenancyConfigValues,
} from '@/core/env';

import {
  pathExistsWithinBase,
  readTextFileWithinBase,
} from './lib/fs-guards-shared';
import { loadedFiles } from './load-env-files';

const ROOT = process.cwd();
const DEPLOYMENT_REQUIRED_ENV_KEYS = ['AUTH_PROVIDER', 'TENANCY_MODE'] as const;
const VERCEL_SENSITIVE_PRESENT_PLACEHOLDER = '[vercel-sensitive-present]';

interface AuthRuntimeUrlConfig {
  nextAuthUrl?: string | undefined;
}

export function runValidation(
  authProvider: string | undefined,
  clerkSecretKey: string | undefined,
  clerkPublishableKey: string | undefined,
  nextAuthSecret: string | undefined,
  tenancyMode: string | undefined,
  defaultTenantId: string | undefined,
  tenantContextSource: string | undefined,
  newRelicEnabled: boolean | string | undefined,
  newRelicLicenseKey: string | undefined,
  nodeOptions: string | undefined,
  nodeEnv: string | undefined,
  appEnv?: string | undefined,
  deploymentEnvKeys?: ReadonlySet<string> | undefined,
  authRuntimeUrls: AuthRuntimeUrlConfig = {},
): string[] {
  const errors: string[] = [];
  const isDeploymentValidation =
    nodeEnv === 'production' || appEnv === 'preview' || appEnv === 'production';
  const nextAuthSecretForValidation = resolvePulledSensitiveValueForValidation(
    'NEXTAUTH_SECRET',
    nextAuthSecret,
    appEnv,
    deploymentEnvKeys,
  );

  if (isDeploymentValidation) {
    if (!authProvider?.trim()) {
      errors.push(
        '[env] AUTH_PROVIDER must be explicitly set for production-like deployments. Do not rely on the local default.',
      );
    }

    if (!tenancyMode?.trim()) {
      errors.push(
        '[env] TENANCY_MODE must be explicitly set for production-like deployments. Do not rely on the local default.',
      );
    }

    if (
      (appEnv === 'preview' || appEnv === 'production') &&
      deploymentEnvKeys !== undefined
    ) {
      for (const key of DEPLOYMENT_REQUIRED_ENV_KEYS) {
        if (!deploymentEnvKeys.has(key)) {
          errors.push(
            `[env] ${key} must be present in .vercel/.env.${appEnv}.local after vercel pull. Do not let local defaults mask missing Vercel configuration.`,
          );
        }
      }

      if (
        appEnv === 'production' &&
        authProvider === 'authjs' &&
        !deploymentEnvKeys.has('NEXTAUTH_URL')
      ) {
        errors.push(
          '[env] NEXTAUTH_URL must be present in .vercel/.env.production.local after vercel pull when AUTH_PROVIDER=authjs. Do not let local env values or build-only fallbacks mask missing Vercel Production runtime configuration.',
        );
      }
    }
  }

  try {
    validateAuthProviderConfigValues(
      authProvider,
      clerkSecretKey,
      clerkPublishableKey,
      nextAuthSecretForValidation,
      nodeEnv,
      authRuntimeUrls.nextAuthUrl,
      appEnv,
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

function readVercelPulledEnvKeys(
  appEnv: string | undefined,
): ReadonlySet<string> | undefined {
  if (appEnv !== 'preview' && appEnv !== 'production') return undefined;

  const envFile = resolve(ROOT, `.vercel/.env.${appEnv}.local`);
  if (!pathExistsWithinBase(envFile, ROOT, 'Vercel environment file')) {
    return new Set();
  }

  const keys = new Set<string>();
  const content = readTextFileWithinBase(
    envFile,
    ROOT,
    'Vercel environment file',
  );

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) continue;

    const key = line.slice(0, eqIdx).trim();
    if (key) keys.add(key);
  }

  return keys;
}

function resolvePulledSensitiveValueForValidation(
  key: string,
  value: string | undefined,
  appEnv: string | undefined,
  deploymentEnvKeys: ReadonlySet<string> | undefined,
): string | undefined {
  if (value?.trim()) return value;

  const isVercelDeploymentEnv = appEnv === 'preview' || appEnv === 'production';
  if (isVercelDeploymentEnv && deploymentEnvKeys?.has(key)) {
    return VERCEL_SENSITIVE_PRESENT_PLACEHOLDER;
  }

  return value;
}

/* v8 ignore start -- CLI console/process wrapper; runValidation is unit-tested. */
function main(): void {
  const source =
    loadedFiles.length > 0
      ? `loaded from: ${loadedFiles.join(', ')}`
      : 'no local .env files found — reading from process.env only (expected in CI after vercel pull)';

  // Read from process.env directly — T3-Env proxy caches values at module init time
  // and may have stale undefined for optional fields when .env.local is loaded after.
  // By the time main() runs, load-env-files has already populated process.env.
  const authProvider = process.env.AUTH_PROVIDER;
  const tenancyMode = process.env.TENANCY_MODE;
  const deploymentEnvKeys = readVercelPulledEnvKeys(process.env.APP_ENV);

  const errors = runValidation(
    authProvider,
    process.env.CLERK_SECRET_KEY,
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    process.env.NEXTAUTH_SECRET,
    tenancyMode,
    process.env.DEFAULT_TENANT_ID,
    process.env.TENANT_CONTEXT_SOURCE,
    process.env.NEW_RELIC_ENABLED,
    process.env.NEW_RELIC_LICENSE_KEY,
    process.env.NODE_OPTIONS,
    process.env.NODE_ENV,
    process.env.APP_ENV,
    deploymentEnvKeys,
    {
      nextAuthUrl: process.env.NEXTAUTH_URL,
    },
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
    `✅ Environment cross-field validation passed (${source})\n   NODE_ENV=${process.env.NODE_ENV ?? 'development'}, AUTH_PROVIDER=${authProvider ?? '[unset]'}, TENANCY_MODE=${tenancyMode ?? '[unset]'}`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
/* v8 ignore stop */
