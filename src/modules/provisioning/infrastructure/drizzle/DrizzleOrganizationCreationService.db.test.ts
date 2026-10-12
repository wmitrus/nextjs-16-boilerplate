/** @vitest-environment node */
import { eq, sql } from 'drizzle-orm';
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  organizationIdFromProvisioningGeneratedUuid,
  tenantIdFromProvisioningGeneratedUuid,
} from '@/core/contracts/canonical-ids.provenance';
import type { DrizzleDb } from '@/core/db/types';

import {
  TenantOrganizationLimitReachedError,
  TenantOrganizationQuotaNotConfiguredError,
} from '../../domain/errors';

import { DrizzleOrganizationCreationService } from './DrizzleOrganizationCreationService';
import {
  organizationsTable,
  tenantAttributesTable,
  tenantsTable,
} from './schema';

import { resolveTestDb, type TestDb } from '@/testing/db/create-test-db';

let testDb: TestDb;

function canonicalCreationInput(input: {
  organizationId: string;
  tenantId: string;
  name: string;
  slug?: string;
}) {
  return {
    ...input,
    organizationId: organizationIdFromProvisioningGeneratedUuid(
      input.organizationId,
    ),
    tenantId: tenantIdFromProvisioningGeneratedUuid(input.tenantId),
  };
}

beforeAll(async () => {
  testDb = await resolveTestDb();
});

afterAll(async () => {
  await testDb.cleanup();
});

async function seedTenant(input: {
  tenantId: string;
  maxOrganizations?: number;
}): Promise<void> {
  await testDb.db.insert(tenantsTable).values({
    id: input.tenantId,
    name: `Tenant ${input.tenantId}`,
  });

  if (input.maxOrganizations !== undefined) {
    await testDb.db.insert(tenantAttributesTable).values({
      tenantId: input.tenantId,
      plan: 'standard',
      maxOrganizations: input.maxOrganizations,
    });
  }
}

async function createInTransaction(input: {
  organizationId: string;
  tenantId: string;
  name: string;
}) {
  return (
    testDb.db as unknown as {
      transaction: <T>(fn: (tx: DrizzleDb) => Promise<T>) => Promise<T>;
    }
  ).transaction(async (tx) => {
    const service = new DrizzleOrganizationCreationService(tx);
    return service.create(canonicalCreationInput(input));
  });
}

describe('DrizzleOrganizationCreationService (real Postgres)', () => {
  it('creates an organization below the configured quota', async () => {
    const tenantId = '21000000-0000-4000-8000-000000000001';
    const organizationId = '22000000-0000-4000-8000-000000000001';

    await seedTenant({
      tenantId,
      maxOrganizations: 2,
    });

    const result = await createInTransaction({
      organizationId,
      tenantId,
      name: 'First Organization',
    });

    expect(result).toEqual({
      organizationId,
      createdNow: true,
    });

    const rows = await testDb.db
      .select({
        id: organizationsTable.id,
        tenantId: organizationsTable.tenantId,
      })
      .from(organizationsTable)
      .where(eq(organizationsTable.id, organizationId));

    expect(rows).toEqual([
      {
        id: organizationId,
        tenantId,
      },
    ]);
  });

  it('rejects creation when maxOrganizations is already reached', async () => {
    const tenantId = '21000000-0000-4000-8000-000000000002';

    await seedTenant({
      tenantId,
      maxOrganizations: 1,
    });

    await testDb.db.insert(organizationsTable).values({
      id: '22000000-0000-4000-8000-000000000002',
      tenantId,
      name: 'Existing Organization',
    });

    await expect(
      createInTransaction({
        organizationId: '22000000-0000-4000-8000-000000000003',
        tenantId,
        name: 'Rejected Organization',
      }),
    ).rejects.toThrow(TenantOrganizationLimitReachedError);

    const rows = await testDb.db
      .select({ count: sql<number>`count(*)::int` })
      .from(organizationsTable)
      .where(eq(organizationsTable.tenantId, tenantId));

    expect(rows[0]?.count).toBe(1);
  });

  it('fails closed when tenant quota configuration is missing', async () => {
    const tenantId = '21000000-0000-4000-8000-000000000003';

    await seedTenant({ tenantId });

    await expect(
      createInTransaction({
        organizationId: '22000000-0000-4000-8000-000000000004',
        tenantId,
        name: 'Unconfigured Organization',
      }),
    ).rejects.toThrow(TenantOrganizationQuotaNotConfiguredError);

    const rows = await testDb.db
      .select({ count: sql<number>`count(*)::int` })
      .from(organizationsTable)
      .where(eq(organizationsTable.tenantId, tenantId));

    expect(rows[0]?.count).toBe(0);
  });

  it('returns the existing organization idempotently without consuming another slot', async () => {
    const tenantId = '21000000-0000-4000-8000-000000000004';
    const organizationId = '22000000-0000-4000-8000-000000000005';

    await seedTenant({
      tenantId,
      maxOrganizations: 1,
    });

    await testDb.db.insert(organizationsTable).values({
      id: organizationId,
      tenantId,
      name: 'Existing Organization',
    });

    const result = await createInTransaction({
      organizationId,
      tenantId,
      name: 'Existing Organization',
    });

    expect(result).toEqual({
      organizationId,
      createdNow: false,
    });

    const rows = await testDb.db
      .select({ count: sql<number>`count(*)::int` })
      .from(organizationsTable)
      .where(eq(organizationsTable.tenantId, tenantId));

    expect(rows[0]?.count).toBe(1);
  });

  it('rejects an organization id already bound to another tenant', async () => {
    const tenantA = '21000000-0000-4000-8000-000000000005';
    const tenantB = '21000000-0000-4000-8000-000000000006';
    const organizationId = '22000000-0000-4000-8000-000000000006';

    await seedTenant({
      tenantId: tenantA,
      maxOrganizations: 2,
    });
    await seedTenant({
      tenantId: tenantB,
      maxOrganizations: 2,
    });

    await testDb.db.insert(organizationsTable).values({
      id: organizationId,
      tenantId: tenantA,
      name: 'Tenant A Organization',
    });

    await expect(
      createInTransaction({
        organizationId,
        tenantId: tenantB,
        name: 'Tenant B Collision',
      }),
    ).rejects.toThrow(
      '[provisioning] Organization ID is already bound to another tenant.',
    );

    const rows = await testDb.db
      .select({
        tenantId: organizationsTable.tenantId,
      })
      .from(organizationsTable)
      .where(eq(organizationsTable.id, organizationId));

    expect(rows).toEqual([{ tenantId: tenantA }]);
  });

  it('serializes concurrent attempts competing for the last quota slot', async () => {
    const databaseUrl = process.env.TEST_DATABASE_URL?.trim();

    expect(databaseUrl).toBeTruthy();
    if (!databaseUrl) {
      throw new Error(
        'TEST_DATABASE_URL is required for the R3 real-Postgres race test.',
      );
    }

    const tenantId = '21000000-0000-4000-8000-000000000007';
    const firstOrganizationId = '22000000-0000-4000-8000-000000000007';
    const secondOrganizationId = '22000000-0000-4000-8000-000000000008';

    await seedTenant({
      tenantId,
      maxOrganizations: 1,
    });

    const firstClient = postgres(databaseUrl, { max: 1 });
    const secondClient = postgres(databaseUrl, { max: 1 });

    const firstDb = drizzlePostgres(firstClient) as unknown as DrizzleDb;
    const secondDb = drizzlePostgres(secondClient) as unknown as DrizzleDb;

    const runAttempt = (
      db: DrizzleDb,
      organizationId: string,
    ): Promise<{
      status: 'fulfilled' | 'rejected';
      organizationId: string;
      reason?: unknown;
    }> =>
      (
        db as unknown as {
          transaction: <T>(fn: (tx: DrizzleDb) => Promise<T>) => Promise<T>;
        }
      )
        .transaction(async (tx) => {
          const service = new DrizzleOrganizationCreationService(tx);
          const result = await service.create(
            canonicalCreationInput({
              organizationId,
              tenantId,
              name: `Race ${organizationId}`,
            }),
          );

          return {
            status: 'fulfilled' as const,
            organizationId: result.organizationId,
          };
        })
        .catch((reason: unknown) => ({
          status: 'rejected' as const,
          organizationId,
          reason,
        }));

    try {
      const [first, second] = await Promise.all([
        runAttempt(firstDb, firstOrganizationId),
        runAttempt(secondDb, secondOrganizationId),
      ]);

      const outcomes = [first, second];
      const fulfilled = outcomes.filter(
        (outcome) => outcome.status === 'fulfilled',
      );
      const rejected = outcomes.filter(
        (outcome) => outcome.status === 'rejected',
      );

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0]?.reason).toBeInstanceOf(
        TenantOrganizationLimitReachedError,
      );

      const rows = await testDb.db
        .select({
          id: organizationsTable.id,
          tenantId: organizationsTable.tenantId,
        })
        .from(organizationsTable)
        .where(eq(organizationsTable.tenantId, tenantId));

      expect(rows).toHaveLength(1);
      expect(rows[0]?.tenantId).toBe(tenantId);
      expect([firstOrganizationId, secondOrganizationId]).toContain(
        rows[0]?.id,
      );
    } finally {
      await Promise.all([
        firstClient.end({ timeout: 5 }),
        secondClient.end({ timeout: 5 }),
      ]);
    }
  });

  it('fails closed when the parent tenant does not exist', async () => {
    const tenantId = '21000000-0000-4000-8000-000000000008';
    const organizationId = '22000000-0000-4000-8000-000000000009';

    await expect(
      new DrizzleOrganizationCreationService(testDb.db).create(
        canonicalCreationInput({
          organizationId,
          tenantId,
          name: 'Missing Tenant Organization',
        }),
      ),
    ).rejects.toThrow(TenantOrganizationQuotaNotConfiguredError);

    const rows = await testDb.db
      .select({ count: sql<number>`count(*)::int` })
      .from(organizationsTable)
      .where(eq(organizationsTable.id, organizationId));

    expect(rows[0]?.count).toBe(0);
  });

  it('enforces maxOrganizations independently for each tenant', async () => {
    const tenantA = '21000000-0000-4000-8000-000000000009';
    const tenantB = '21000000-0000-4000-8000-000000000010';

    await seedTenant({
      tenantId: tenantA,
      maxOrganizations: 1,
    });
    await seedTenant({
      tenantId: tenantB,
      maxOrganizations: 1,
    });

    await testDb.db.insert(organizationsTable).values({
      id: '22000000-0000-4000-8000-000000000010',
      tenantId: tenantA,
      name: 'Tenant A Existing Organization',
    });

    const service = new DrizzleOrganizationCreationService(testDb.db);

    await expect(
      service.create(
        canonicalCreationInput({
          organizationId: '22000000-0000-4000-8000-000000000011',
          tenantId: tenantA,
          name: 'Tenant A Rejected Organization',
        }),
      ),
    ).rejects.toThrow(TenantOrganizationLimitReachedError);

    const result = await service.create(
      canonicalCreationInput({
        organizationId: '22000000-0000-4000-8000-000000000012',
        tenantId: tenantB,
        name: 'Tenant B Organization',
      }),
    );

    expect(result.createdNow).toBe(true);

    const tenantACount = await testDb.db
      .select({ count: sql<number>`count(*)::int` })
      .from(organizationsTable)
      .where(eq(organizationsTable.tenantId, tenantA));

    const tenantBCount = await testDb.db
      .select({ count: sql<number>`count(*)::int` })
      .from(organizationsTable)
      .where(eq(organizationsTable.tenantId, tenantB));

    expect(tenantACount[0]?.count).toBe(1);
    expect(tenantBCount[0]?.count).toBe(1);
  });

  it('keeps the quota invariant across repeated concurrent races', async () => {
    const databaseUrl = process.env.TEST_DATABASE_URL?.trim();

    expect(databaseUrl).toBeTruthy();
    if (!databaseUrl) {
      throw new Error(
        'TEST_DATABASE_URL is required for the R3 real-Postgres race test.',
      );
    }

    const firstClient = postgres(databaseUrl, { max: 1 });
    const secondClient = postgres(databaseUrl, { max: 1 });

    const firstDb = drizzlePostgres(firstClient) as unknown as DrizzleDb;
    const secondDb = drizzlePostgres(secondClient) as unknown as DrizzleDb;

    const firstService = new DrizzleOrganizationCreationService(firstDb);
    const secondService = new DrizzleOrganizationCreationService(secondDb);

    try {
      for (let round = 0; round < 12; round += 1) {
        const tenantId = crypto.randomUUID();
        const firstOrganizationId = crypto.randomUUID();
        const secondOrganizationId = crypto.randomUUID();

        await seedTenant({
          tenantId,
          maxOrganizations: 1,
        });

        const outcomes = await Promise.allSettled([
          firstService.create(
            canonicalCreationInput({
              organizationId: firstOrganizationId,
              tenantId,
              name: `Race A ${round}`,
            }),
          ),
          secondService.create(
            canonicalCreationInput({
              organizationId: secondOrganizationId,
              tenantId,
              name: `Race B ${round}`,
            }),
          ),
        ]);

        const fulfilled = outcomes.filter(
          (outcome) => outcome.status === 'fulfilled',
        );
        const rejected = outcomes.filter(
          (outcome) => outcome.status === 'rejected',
        );

        expect(fulfilled).toHaveLength(1);
        expect(rejected).toHaveLength(1);

        if (rejected[0]?.status === 'rejected') {
          expect(rejected[0].reason).toBeInstanceOf(
            TenantOrganizationLimitReachedError,
          );
        }

        const rows = await testDb.db
          .select({ count: sql<number>`count(*)::int` })
          .from(organizationsTable)
          .where(eq(organizationsTable.tenantId, tenantId));

        expect(rows[0]?.count).toBe(1);
      }
    } finally {
      await Promise.all([
        firstClient.end({ timeout: 5 }),
        secondClient.end({ timeout: 5 }),
      ]);
    }
  });
});
