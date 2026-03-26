import fs from 'node:fs';
import path from 'node:path';

export const SEEDED_TENANT_IDS = {
  acme: '10000000-0000-4000-8000-000000000001',
  globex: '10000000-0000-4000-8000-000000000002',
} as const;

type RuntimeTenancyMode = 'single' | 'personal' | 'org';
type RuntimeTenantContextSource = 'provider' | 'db';
type CrossProviderEmailLinking = 'disabled' | 'verified-only';

interface RuntimeProfile {
  readonly authProvider: string;
  readonly tenancyMode: RuntimeTenancyMode;
  readonly tenantContextSource?: RuntimeTenantContextSource;
  readonly defaultTenantId?: string;
  readonly tenantContextCookie: string;
  readonly freeTierMaxUsers: number;
  readonly crossProviderEmailLinking: CrossProviderEmailLinking;
  readonly oauthProvider?: string;
}

const ENV_VAR_KEY_PATTERN = /^[A-Z_][A-Z0-9_]*$/;

function readEnvFile(filePath: string): Map<string, string> {
  const cwd = process.cwd();
  const resolved = path.resolve(filePath);

  if (!resolved.startsWith(cwd + path.sep) && resolved !== cwd) {
    return new Map();
  }

  // resolved is confined to cwd; path.resolve() always produces an absolute path from a static literal
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  if (!fs.existsSync(resolved)) {
    return new Map();
  }

  // eslint-disable-next-line security/detect-non-literal-fs-filename
  const content = fs.readFileSync(resolved, 'utf8');
  const env = new Map<string, string>();

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
    if (!ENV_VAR_KEY_PATTERN.test(key)) {
      continue;
    }
    const value = line.slice(equalsIndex + 1).trim();
    env.set(key, value.replace(/^['"]|['"]$/g, ''));
  }

  return env;
}

const processEnvSnapshot = new Map<string, string>(
  Object.entries(process.env).filter(
    (entry): entry is [string, string] => entry[1] !== undefined,
  ),
);

const envE2ELocal = readEnvFile(path.resolve(process.cwd(), '.env.e2e.local'));
const envE2E = readEnvFile(path.resolve(process.cwd(), '.env.e2e'));
const envLocal = readEnvFile(path.resolve(process.cwd(), '.env.local'));

function readValue(name: string): string | undefined {
  const processValue = processEnvSnapshot.get(name);
  if (processValue && processValue.trim().length > 0) {
    return processValue;
  }

  const envE2ELocalValue = envE2ELocal.get(name);
  if (envE2ELocalValue && envE2ELocalValue.trim().length > 0) {
    return envE2ELocalValue;
  }

  const envE2EValue = envE2E.get(name);
  if (envE2EValue && envE2EValue.trim().length > 0) {
    return envE2EValue;
  }

  const fileValue = envLocal.get(name);
  if (fileValue && fileValue.trim().length > 0) {
    return fileValue;
  }

  return undefined;
}

export function getRuntimeProfile(): RuntimeProfile {
  return {
    authProvider: readValue('AUTH_PROVIDER') ?? 'clerk',
    tenancyMode: (readValue('TENANCY_MODE') as RuntimeTenancyMode) ?? 'single',
    tenantContextSource: readValue('TENANT_CONTEXT_SOURCE') as
      | RuntimeTenantContextSource
      | undefined,
    defaultTenantId: readValue('DEFAULT_TENANT_ID'),
    tenantContextCookie:
      readValue('TENANT_CONTEXT_COOKIE') ?? 'active_tenant_id',
    freeTierMaxUsers: Number(readValue('FREE_TIER_MAX_USERS') ?? '5'),
    crossProviderEmailLinking:
      (readValue('CROSS_PROVIDER_EMAIL_LINKING') as
        | CrossProviderEmailLinking
        | undefined) ?? 'verified-only',
    oauthProvider: readValue('E2E_CLERK_OAUTH_PROVIDER'),
  };
}

export function isSingleRuntime(profile: RuntimeProfile): boolean {
  return profile.authProvider === 'clerk' && profile.tenancyMode === 'single';
}

export function isPersonalRuntime(profile: RuntimeProfile): boolean {
  return profile.authProvider === 'clerk' && profile.tenancyMode === 'personal';
}

export function isOrgProviderRuntime(profile: RuntimeProfile): boolean {
  return (
    profile.authProvider === 'clerk' &&
    profile.tenancyMode === 'org' &&
    profile.tenantContextSource === 'provider'
  );
}

export function isOrgDbRuntime(profile: RuntimeProfile): boolean {
  return (
    profile.authProvider === 'clerk' &&
    profile.tenancyMode === 'org' &&
    profile.tenantContextSource === 'db'
  );
}

export function isMissingSeededDefaultTenant(profile: RuntimeProfile): boolean {
  return (
    isSingleRuntime(profile) &&
    Boolean(profile.defaultTenantId) &&
    profile.defaultTenantId !== SEEDED_TENANT_IDS.acme &&
    profile.defaultTenantId !== SEEDED_TENANT_IDS.globex
  );
}
