import { createHash } from 'node:crypto';

import { z } from 'zod';

import { env } from '@/core/env';

/**
 * OZI-78 A4.2b: the bounded, non-secret evidence shape a deployment-bound
 * environment-contract read produces. Fingerprints only the explicitly
 * enumerated dimensions below -- never an arbitrary environment dump, and
 * never anything that would force reading/exporting a raw secret.
 *
 * Bumping this version is required whenever the participating dimensions or
 * the fingerprint serialization change, so an old candidate and the current
 * expected contract are never silently compared under mismatched rules. v2
 * added `databaseHost`/`databaseName`/`defaultTenantId` -- a v1 candidate
 * (or a v1 expected contract) must fail closed against v2, never be silently
 * compared field-by-field.
 */
export const ROLLBACK_ENVIRONMENT_CONTRACT_VERSION = 'v2';

const MAX_DATABASE_HOST_LENGTH = 255;
const MAX_DATABASE_NAME_BYTES = 63;
// Conservative DNS-hostname charset: no whitespace, control characters, URL
// delimiters, path/query/userinfo characters, or percent-encoding.
const DATABASE_HOST_PATTERN = /^[a-zA-Z0-9.-]{1,255}$/;

const uuidSchema = z.uuid();

function isValidUuid(value: unknown): value is string {
  return typeof value === 'string' && uuidSchema.safeParse(value).success;
}

function isValidDatabaseHost(value: string): boolean {
  return (
    value.length <= MAX_DATABASE_HOST_LENGTH &&
    DATABASE_HOST_PATTERN.test(value)
  );
}

function isValidDatabaseName(value: string): boolean {
  return (
    value.length > 0 &&
    !/[\s\u0000-\u001f\u007f]/.test(value) &&
    new TextEncoder().encode(value).byteLength <= MAX_DATABASE_NAME_BYTES
  );
}

export interface EnvironmentContractDimensions {
  authProvider: 'authjs' | 'clerk';
  tenancyMode: 'org' | 'personal' | 'single';
  tenantContextSource: 'db' | 'provider' | null;
  databaseHost: string;
  databaseName: string;
  defaultTenantId: string | null;
}

export interface EnvironmentContractEvidence {
  authProvider: 'authjs' | 'clerk';
  contractVersion: typeof ROLLBACK_ENVIRONMENT_CONTRACT_VERSION;
  fingerprint: string;
}

/**
 * Derives the candidate runtime's own database host/name from the exact
 * connection string the application itself uses: `env.DATABASE_URL`. Never
 * `DATABASE_URL_UNPOOLED` -- that is not necessarily the connection this
 * runtime opens, and using it here would let the fingerprint attest to a
 * database the application was never actually configured to use.
 *
 * This is local, configuration-only parsing -- no connection is ever opened,
 * no provider API is called. A malformed URL, non-Postgres protocol, empty
 * or oversized host, unsafe percent-encoding in the pathname, or an empty/
 * malformed database name all fail closed (`undefined`) rather than
 * producing a partial or best-effort identity.
 */
function deriveCandidateDatabaseIdentity():
  | { databaseHost: string; databaseName: string }
  | undefined {
  const databaseUrl = env.DATABASE_URL?.trim();
  if (!databaseUrl) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    return undefined;
  }
  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
    return undefined;
  }
  if (!isValidDatabaseHost(parsed.hostname)) return undefined;
  let databaseName: string;
  try {
    databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  } catch {
    return undefined;
  }
  if (!isValidDatabaseName(databaseName)) return undefined;
  return { databaseHost: parsed.hostname, databaseName };
}

/**
 * Resolves the candidate's own single-tenant identity, when applicable.
 * `TENANCY_MODE=single` requires a valid-UUID `DEFAULT_TENANT_ID` to
 * participate in the fingerprint; absent or malformed fails the whole
 * contract closed (`undefined`) rather than silently fingerprinting `null`
 * -- a missing/broken tenant pin on a single-tenant candidate must never be
 * indistinguishable from "not applicable". `org`/`personal` modes always
 * fingerprint `null` and deliberately never read `DEFAULT_TENANT_ID`, even
 * if an ambient value happens to be set, so a leftover env var can never
 * influence the fingerprint in those modes.
 */
function deriveCandidateDefaultTenantId(
  tenancyMode: 'org' | 'personal' | 'single',
): string | null | undefined {
  if (tenancyMode !== 'single') return null;
  return isValidUuid(env.DEFAULT_TENANT_ID) ? env.DEFAULT_TENANT_ID : undefined;
}

/**
 * Reads the current, live security-/tenancy-/database-identity switches from
 * the central env schema. Returns `undefined` for an `AUTH_PROVIDER` this
 * contract does not model (`supabase`/`neon`), an unusable
 * `env.DATABASE_URL`, or (in single-tenant mode) a missing/malformed
 * `DEFAULT_TENANT_ID` -- rather than fingerprinting a partial or
 * best-effort result.
 */
export function readCurrentEnvironmentContractDimensions():
  | EnvironmentContractDimensions
  | undefined {
  if (env.AUTH_PROVIDER !== 'authjs' && env.AUTH_PROVIDER !== 'clerk') {
    return undefined;
  }
  const databaseIdentity = deriveCandidateDatabaseIdentity();
  if (!databaseIdentity) return undefined;
  const defaultTenantId = deriveCandidateDefaultTenantId(env.TENANCY_MODE);
  if (defaultTenantId === undefined) return undefined;
  return {
    authProvider: env.AUTH_PROVIDER,
    databaseHost: databaseIdentity.databaseHost,
    databaseName: databaseIdentity.databaseName,
    defaultTenantId,
    tenancyMode: env.TENANCY_MODE,
    tenantContextSource: env.TENANT_CONTEXT_SOURCE ?? null,
  };
}

/**
 * Deterministic, stably-ordered, secret-free serialization -- the object
 * literal's key order is fixed by this function, not by whatever order a
 * caller happened to build `dimensions` in.
 */
export function fingerprintEnvironmentContract(
  dimensions: EnvironmentContractDimensions,
): string {
  const serialized = JSON.stringify({
    authProvider: dimensions.authProvider,
    databaseHost: dimensions.databaseHost,
    databaseName: dimensions.databaseName,
    defaultTenantId: dimensions.defaultTenantId,
    tenancyMode: dimensions.tenancyMode,
    tenantContextSource: dimensions.tenantContextSource,
  });
  return createHash('sha256').update(serialized).digest('hex');
}

export function buildEnvironmentContractEvidence(
  dimensions: EnvironmentContractDimensions,
): EnvironmentContractEvidence {
  return {
    authProvider: dimensions.authProvider,
    contractVersion: ROLLBACK_ENVIRONMENT_CONTRACT_VERSION,
    fingerprint: fingerprintEnvironmentContract(dimensions),
  };
}
