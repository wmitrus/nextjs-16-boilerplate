import { createHash } from 'node:crypto';

import { env } from '@/core/env';

/**
 * OZI-78 A4.2b: the bounded, non-secret evidence shape a deployment-bound
 * environment-contract read produces. Fingerprints only the explicitly
 * enumerated dimensions below -- never an arbitrary environment dump, and
 * never anything that would force reading/exporting a raw secret.
 *
 * Bumping this version is required whenever the participating dimensions or
 * the fingerprint serialization change, so an old candidate and the current
 * expected contract are never silently compared under mismatched rules.
 */
export const ROLLBACK_ENVIRONMENT_CONTRACT_VERSION = 'v1';

export interface EnvironmentContractDimensions {
  authProvider: 'authjs' | 'clerk';
  tenancyMode: 'org' | 'personal' | 'single';
  tenantContextSource: 'db' | 'provider' | null;
}

export interface EnvironmentContractEvidence {
  authProvider: 'authjs' | 'clerk';
  contractVersion: typeof ROLLBACK_ENVIRONMENT_CONTRACT_VERSION;
  fingerprint: string;
}

/**
 * Reads the current, live security-/tenancy-mode switches from the central
 * env schema. Returns `undefined` for an `AUTH_PROVIDER` this contract does
 * not model (`supabase`/`neon`) rather than fingerprinting a value the
 * comparison was never designed to reason about.
 */
export function readCurrentEnvironmentContractDimensions():
  | EnvironmentContractDimensions
  | undefined {
  if (env.AUTH_PROVIDER !== 'authjs' && env.AUTH_PROVIDER !== 'clerk') {
    return undefined;
  }
  return {
    authProvider: env.AUTH_PROVIDER,
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
