import { readEnvFileMap, resolveProjectPath } from './env-files';

export const DEFAULT_INTERNAL_API_KEY = 'test-internal-api-key';

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
