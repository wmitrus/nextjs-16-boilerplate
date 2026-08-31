import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  env: {
    AUTH_PROVIDER: 'authjs' as string,
    TENANCY_MODE: 'single' as 'org' | 'personal' | 'single',
    TENANT_CONTEXT_SOURCE: undefined as 'db' | 'provider' | undefined,
  },
}));

vi.mock('@/core/env', () => ({ env: mocks.env }));

import {
  buildEnvironmentContractEvidence,
  fingerprintEnvironmentContract,
  readCurrentEnvironmentContractDimensions,
  ROLLBACK_ENVIRONMENT_CONTRACT_VERSION,
} from './rollback-environment-contract';

beforeEach(() => {
  mocks.env.AUTH_PROVIDER = 'authjs';
  mocks.env.TENANCY_MODE = 'single';
  mocks.env.TENANT_CONTEXT_SOURCE = undefined;
});

describe('rollback environment-contract dimensions', () => {
  it('reads the enumerated security-critical dimensions only', () => {
    mocks.env.AUTH_PROVIDER = 'clerk';
    mocks.env.TENANCY_MODE = 'org';
    mocks.env.TENANT_CONTEXT_SOURCE = 'provider';
    expect(readCurrentEnvironmentContractDimensions()).toEqual({
      authProvider: 'clerk',
      tenancyMode: 'org',
      tenantContextSource: 'provider',
    });
  });

  it('normalizes an absent TENANT_CONTEXT_SOURCE to null', () => {
    expect(readCurrentEnvironmentContractDimensions()).toMatchObject({
      tenantContextSource: null,
    });
  });

  it.each(['supabase', 'neon', 'unknown'])(
    'returns undefined for an unmodeled AUTH_PROVIDER %s',
    (authProvider) => {
      mocks.env.AUTH_PROVIDER = authProvider;
      expect(readCurrentEnvironmentContractDimensions()).toBeUndefined();
    },
  );
});

describe('rollback environment-contract fingerprint', () => {
  const dimensions = {
    authProvider: 'authjs' as const,
    tenancyMode: 'single' as const,
    tenantContextSource: null,
  };

  it('is deterministic for identical dimensions', () => {
    expect(fingerprintEnvironmentContract(dimensions)).toBe(
      fingerprintEnvironmentContract({ ...dimensions }),
    );
  });

  it('is a lowercase 64-hex SHA-256 digest', () => {
    expect(fingerprintEnvironmentContract(dimensions)).toMatch(
      /^[a-f0-9]{64}$/,
    );
  });

  it.each([
    ['authProvider', { ...dimensions, authProvider: 'clerk' as const }],
    ['tenancyMode', { ...dimensions, tenancyMode: 'org' as const }],
    [
      'tenantContextSource',
      { ...dimensions, tenantContextSource: 'db' as const },
    ],
  ])('changes when %s changes', (_field, changed) => {
    expect(fingerprintEnvironmentContract(changed)).not.toBe(
      fingerprintEnvironmentContract(dimensions),
    );
  });

  it('builds bounded evidence with exactly authProvider/contractVersion/fingerprint', () => {
    const evidence = buildEnvironmentContractEvidence(dimensions);
    expect(Object.keys(evidence).sort()).toEqual([
      'authProvider',
      'contractVersion',
      'fingerprint',
    ]);
    expect(evidence).toMatchObject({
      authProvider: 'authjs',
      contractVersion: ROLLBACK_ENVIRONMENT_CONTRACT_VERSION,
    });
  });
});
