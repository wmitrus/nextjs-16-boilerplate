import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  env: {
    AUTH_PROVIDER: 'authjs' as string,
    DATABASE_URL:
      'postgresql://user:password@ep-prod.us-east-2.aws.neon.tech/app_production' as
        | string
        | undefined,
    // Present in the mock only for the DATABASE_URL_UNPOOLED regression
    // test below -- the real `env` module (`@/core/env`) has no such field
    // at all (it is not part of the zod schema), so this exists purely to
    // prove the reader would ignore it even if it were present.
    DATABASE_URL_UNPOOLED: undefined as string | undefined,
    DB_DRIVER: 'postgres' as 'pglite' | 'postgres' | undefined,
    DB_PROVIDER: 'drizzle' as 'drizzle' | 'prisma' | undefined,
    DEFAULT_TENANT_ID: undefined as string | undefined,
    NODE_ENV: 'production' as string | undefined,
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

const validTenantId = '11111111-1111-4111-8111-111111111111';
const otherValidTenantId = '22222222-2222-4222-8222-222222222222';

beforeEach(() => {
  mocks.env.AUTH_PROVIDER = 'authjs';
  mocks.env.DATABASE_URL =
    'postgresql://user:password@ep-prod.us-east-2.aws.neon.tech/app_production';
  mocks.env.DATABASE_URL_UNPOOLED = undefined;
  mocks.env.DB_DRIVER = 'postgres';
  mocks.env.DB_PROVIDER = 'drizzle';
  mocks.env.DEFAULT_TENANT_ID = validTenantId;
  mocks.env.NODE_ENV = 'production';
  mocks.env.TENANCY_MODE = 'single';
  mocks.env.TENANT_CONTEXT_SOURCE = undefined;
});

describe('rollback environment-contract dimensions', () => {
  it('reads the enumerated security-critical dimensions, including database identity, DB runtime, and single-tenant ID', () => {
    mocks.env.AUTH_PROVIDER = 'clerk';
    mocks.env.TENANCY_MODE = 'single';
    mocks.env.TENANT_CONTEXT_SOURCE = 'provider';
    mocks.env.DATABASE_URL =
      'postgresql://user:password@ep-prod.us-east-2.aws.neon.tech/app_production';
    mocks.env.DEFAULT_TENANT_ID = validTenantId;
    expect(readCurrentEnvironmentContractDimensions()).toEqual({
      authProvider: 'clerk',
      databaseHost: 'ep-prod.us-east-2.aws.neon.tech',
      databaseName: 'app_production',
      dbDriver: 'postgres',
      dbProvider: 'drizzle',
      defaultTenantId: validTenantId,
      tenancyMode: 'single',
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

  describe('candidate database identity (FINDING 1)', () => {
    it('extracts host + database name from the exact runtime DATABASE_URL', () => {
      mocks.env.DATABASE_URL =
        'postgresql://user:password@ep-candidate.us-east-2.aws.neon.tech/candidate_db';
      expect(readCurrentEnvironmentContractDimensions()).toMatchObject({
        databaseHost: 'ep-candidate.us-east-2.aws.neon.tech',
        databaseName: 'candidate_db',
      });
    });

    it.each([
      ['missing DATABASE_URL', undefined],
      ['not a URL', 'not a url'],
      ['non-Postgres protocol', 'mysql://host/db'],
      ['empty host', 'postgresql:///db'],
      ['empty database name', 'postgresql://host/'],
      ['no database path at all', 'postgresql://host'],
      ['malformed percent encoding', 'postgresql://host/%'],
      [
        'database name exceeding 63 UTF-8 bytes',
        `postgresql://host/${'a'.repeat(64)}`,
      ],
    ])('fails closed for %s', (_label, databaseUrl) => {
      mocks.env.DATABASE_URL = databaseUrl;
      expect(readCurrentEnvironmentContractDimensions()).toBeUndefined();
    });

    it('uses only DATABASE_URL, never DATABASE_URL_UNPOOLED, when the two point at different hosts/databases', () => {
      // Real conflicting values: if the reader ever switched (even
      // partially) to DATABASE_URL_UNPOOLED, the asserted host/name below
      // would come back as the "wrong" (unpooled) ones instead, failing
      // this assertion.
      mocks.env.DATABASE_URL =
        'postgresql://user:password@ep-candidate-runtime-pooler.us-east-2.aws.neon.tech/correct_runtime_db';
      mocks.env.DATABASE_URL_UNPOOLED =
        'postgresql://user:password@ep-completely-different-direct-host.us-east-2.aws.neon.tech/wrong_unpooled_db';
      expect(readCurrentEnvironmentContractDimensions()).toMatchObject({
        databaseHost: 'ep-candidate-runtime-pooler.us-east-2.aws.neon.tech',
        databaseName: 'correct_runtime_db',
      });
    });
  });

  describe('candidate DB runtime provider/driver (Codex findings 1 & 2: pglite/prisma false PASS)', () => {
    it('resolves the effective drizzle/postgres runtime via the shared resolver', () => {
      mocks.env.DB_PROVIDER = 'drizzle';
      mocks.env.DB_DRIVER = 'postgres';
      expect(readCurrentEnvironmentContractDimensions()).toMatchObject({
        dbDriver: 'postgres',
        dbProvider: 'drizzle',
      });
    });

    it('resolves an explicit pglite driver rather than fingerprinting the raw env value blindly', () => {
      mocks.env.DB_DRIVER = 'pglite';
      expect(readCurrentEnvironmentContractDimensions()).toMatchObject({
        dbDriver: 'pglite',
      });
    });

    it('resolves the same default as bootstrap when DB_DRIVER is unset (production -> postgres)', () => {
      mocks.env.DB_DRIVER = undefined;
      mocks.env.NODE_ENV = 'production';
      expect(readCurrentEnvironmentContractDimensions()).toMatchObject({
        dbDriver: 'postgres',
      });
    });

    it('resolves the same default as bootstrap when DB_DRIVER is unset (non-production -> pglite)', () => {
      mocks.env.DB_DRIVER = undefined;
      mocks.env.NODE_ENV = 'development';
      expect(readCurrentEnvironmentContractDimensions()).toMatchObject({
        dbDriver: 'pglite',
      });
    });

    it('resolves an explicit prisma provider', () => {
      mocks.env.DB_PROVIDER = 'prisma';
      expect(readCurrentEnvironmentContractDimensions()).toMatchObject({
        dbProvider: 'prisma',
      });
    });

    it('fails closed when the resolver itself throws (e.g. prisma + pglite)', () => {
      mocks.env.DB_PROVIDER = 'prisma';
      mocks.env.DB_DRIVER = 'pglite';
      expect(readCurrentEnvironmentContractDimensions()).toBeUndefined();
    });
  });

  describe('candidate single-tenant identity (FINDING 2)', () => {
    it('includes a valid single-mode DEFAULT_TENANT_ID in the dimensions', () => {
      mocks.env.TENANCY_MODE = 'single';
      mocks.env.DEFAULT_TENANT_ID = validTenantId;
      expect(readCurrentEnvironmentContractDimensions()).toMatchObject({
        defaultTenantId: validTenantId,
      });
    });

    it.each([
      ['absent', undefined],
      ['empty string', ''],
      ['malformed', 'not-a-uuid'],
      ['wrong version nibble', '11111111-1111-1111-1111-111111111111'],
    ])(
      'fails closed for single mode with a %s DEFAULT_TENANT_ID',
      (_label, value) => {
        mocks.env.TENANCY_MODE = 'single';
        mocks.env.DEFAULT_TENANT_ID = value;
        expect(readCurrentEnvironmentContractDimensions()).toBeUndefined();
      },
    );

    it.each(['org', 'personal'] as const)(
      'fingerprints defaultTenantId as null in %s mode',
      (tenancyMode) => {
        mocks.env.TENANCY_MODE = tenancyMode;
        mocks.env.TENANT_CONTEXT_SOURCE =
          tenancyMode === 'org' ? 'provider' : undefined;
        mocks.env.DEFAULT_TENANT_ID = undefined;
        expect(readCurrentEnvironmentContractDimensions()).toMatchObject({
          defaultTenantId: null,
        });
      },
    );

    it.each(['org', 'personal'] as const)(
      'ignores an ambient DEFAULT_TENANT_ID in %s mode -- still fingerprints null',
      (tenancyMode) => {
        mocks.env.TENANCY_MODE = tenancyMode;
        mocks.env.TENANT_CONTEXT_SOURCE =
          tenancyMode === 'org' ? 'provider' : undefined;
        mocks.env.DEFAULT_TENANT_ID = validTenantId;
        expect(readCurrentEnvironmentContractDimensions()).toMatchObject({
          defaultTenantId: null,
        });
      },
    );
  });
});

describe('rollback environment-contract fingerprint', () => {
  const dimensions = {
    authProvider: 'authjs' as const,
    databaseHost: 'ep-prod.us-east-2.aws.neon.tech',
    databaseName: 'app_production',
    dbDriver: 'postgres' as const,
    dbProvider: 'drizzle' as const,
    defaultTenantId: validTenantId,
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
    [
      'databaseHost',
      { ...dimensions, databaseHost: 'ep-different.us-east-2.aws.neon.tech' },
    ],
    ['databaseName', { ...dimensions, databaseName: 'other_db' }],
    ['defaultTenantId', { ...dimensions, defaultTenantId: otherValidTenantId }],
    ['dbProvider', { ...dimensions, dbProvider: 'prisma' as const }],
    ['dbDriver', { ...dimensions, dbDriver: 'pglite' as const }],
  ])('changes when %s changes', (_field, changed) => {
    expect(fingerprintEnvironmentContract(changed)).not.toBe(
      fingerprintEnvironmentContract(dimensions),
    );
  });

  it('a candidate with the same host/name but pglite produces a different fingerprint than postgres', () => {
    expect(
      fingerprintEnvironmentContract({ ...dimensions, dbDriver: 'pglite' }),
    ).not.toBe(fingerprintEnvironmentContract(dimensions));
  });

  it('a candidate with the same host/name but prisma produces a different fingerprint than drizzle', () => {
    expect(
      fingerprintEnvironmentContract({ ...dimensions, dbProvider: 'prisma' }),
    ).not.toBe(fingerprintEnvironmentContract(dimensions));
  });

  it('same host but a different database name changes the fingerprint', () => {
    expect(
      fingerprintEnvironmentContract({
        ...dimensions,
        databaseName: 'different_db',
      }),
    ).not.toBe(fingerprintEnvironmentContract(dimensions));
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

  it('version is exactly v3', () => {
    expect(ROLLBACK_ENVIRONMENT_CONTRACT_VERSION).toBe('v3');
  });

  it('bounded evidence never exposes databaseHost/databaseName/dbProvider/dbDriver/defaultTenantId/DATABASE_URL', () => {
    const evidence = buildEnvironmentContractEvidence(dimensions);
    const serialized = JSON.stringify(evidence);
    expect(serialized).not.toContain(dimensions.databaseHost);
    expect(serialized).not.toContain(dimensions.databaseName);
    expect(serialized).not.toContain(dimensions.defaultTenantId!);
    expect(serialized).not.toMatch(
      /database|DATABASE_URL|dbProvider|dbDriver|drizzle|prisma|postgres|pglite/i,
    );
  });
});
