import { readEnvFileMap, resolveProjectPath } from './env-files';

/**
 * Fallback key for E2E runs that do not supply one.
 *
 * At least `MIN_INTERNAL_API_KEY_LENGTH` characters on purpose (SEC-44). In
 * CI the Playwright `webServer` runs `pnpm start`, i.e. `NODE_ENV=production`,
 * and injects this value as `INTERNAL_API_KEY` -- so a fixture below the
 * production floor would stop the E2E server from booting at all. The
 * previous 21-character value would have done exactly that.
 *
 * A fixture, never a secret: it is committed, and any deployment relying on
 * it is misconfigured.
 */
export const DEFAULT_INTERNAL_API_KEY =
  'e2e-fixture-internal-api-key-not-a-secret';

function resolveInternalApiKeyFromFiles(): string | undefined {
  const envFiles = [
    resolveProjectPath('.env.local'),
    resolveProjectPath('.env'),
  ];

  for (const envFile of envFiles) {
    const value = readEnvFileMap(
      envFile,
      `internal API key env file: ${envFile}`,
    ).get('INTERNAL_API_KEY');

    if (value && value.trim().length > 0) {
      return value;
    }
  }

  return undefined;
}

export function resolveInternalApiKey(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const value = env.INTERNAL_API_KEY?.trim();
  if (value && value.length > 0) {
    return value;
  }

  return resolveInternalApiKeyFromFiles() ?? DEFAULT_INTERNAL_API_KEY;
}
