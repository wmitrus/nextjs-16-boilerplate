/** @vitest-environment node */
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { resolveCanonicalAuditWriteScope } from './resolve-canonical-audit-write-scope';

import { AuditCanonicalWriteInvariantError } from '@/modules/audit-log/domain/errors';
import { resolveTestDb, type TestDb } from '@/testing/db/create-test-db';

let testDb: TestDb;

const TENANT_A = '31000000-0000-4000-8000-000000000001';
const ORG_A1 = '35000000-0000-4000-8000-000000000001';
const ORG_A2 = '35000000-0000-4000-8000-000000000002';
const UNKNOWN = '35000000-0000-4000-8000-000000000099';
const EXT_A1 = 'org_audit_external_a1';
const PROVIDER = 'clerk' as const;

async function resolveOrdinary(candidate: string) {
  return resolveCanonicalAuditWriteScope({
    isPlatformAdmin: false,
    ordinaryActiveOrganizationId: candidate,
    platformTargetOrganizationId: null,
    db: testDb.db,
    authProvider: PROVIDER,
  });
}

async function resolvePlatform(target: string | null) {
  return resolveCanonicalAuditWriteScope({
    isPlatformAdmin: true,
    ordinaryActiveOrganizationId: 'unused',
    platformTargetOrganizationId: target,
    db: testDb.db,
    authProvider: PROVIDER,
  });
}

beforeAll(async () => {
  testDb = await resolveTestDb();

  await testDb.db.execute(
    sql`INSERT INTO tenants (id, name)
        VALUES (${TENANT_A}, 'Audit Resolver Tenant')`,
  );

  await testDb.db.execute(
    sql`INSERT INTO organizations (id, tenant_id, name) VALUES
        (${ORG_A1}, ${TENANT_A}, 'Audit Resolver Org A1'),
        (${ORG_A2}, ${TENANT_A}, 'Audit Resolver Org A2')`,
  );

  await testDb.db.execute(
    sql`INSERT INTO auth_organization_identities
        (provider, external_org_id, organization_id)
        VALUES (${PROVIDER}, ${EXT_A1}, ${ORG_A1})`,
  );
});

afterAll(async () => {
  await testDb.db.execute(
    sql`DELETE FROM auth_organization_identities
        WHERE organization_id IN (${ORG_A1}, ${ORG_A2})`,
  );
  await testDb.db.execute(
    sql`DELETE FROM organizations
        WHERE id IN (${ORG_A1}, ${ORG_A2})`,
  );
  await testDb.db.execute(sql`DELETE FROM tenants WHERE id = ${TENANT_A}`);
  await testDb.cleanup();
});

describe('resolveCanonicalAuditWriteScope', () => {
  it('resolves a verified internal organization with its canonical parent tenant', async () => {
    await expect(resolvePlatform(ORG_A1)).resolves.toEqual({
      outcome: 'resolved',
      writeScope: {
        kind: 'organization',
        organizationId: ORG_A1,
        tenantId: TENANT_A,
      },
    });
  });

  it('resolves a provider external organization id to the internal organization', async () => {
    await expect(resolvePlatform(EXT_A1)).resolves.toEqual({
      outcome: 'resolved',
      writeScope: {
        kind: 'organization',
        organizationId: ORG_A1,
        tenantId: TENANT_A,
      },
    });
  });

  it('treats an explicit null platform target as platform-global', async () => {
    await expect(resolvePlatform(null)).resolves.toEqual({
      outcome: 'resolved',
      writeScope: { kind: 'platform-global' },
    });
  });

  it('returns unresolvable for an unknown platform organization target', async () => {
    await expect(resolvePlatform(UNKNOWN)).resolves.toEqual({
      outcome: 'unresolvable-organization-target',
    });
  });

  it('fails closed for an unresolved ordinary organization context', async () => {
    await expect(resolveOrdinary(UNKNOWN)).rejects.toBeInstanceOf(
      AuditCanonicalWriteInvariantError,
    );
  });

  it('rejects ambiguous internal and provider evidence without precedence', async () => {
    await testDb.db.execute(
      sql`INSERT INTO auth_organization_identities
          (provider, external_org_id, organization_id)
          VALUES (${PROVIDER}, ${ORG_A1}, ${ORG_A2})`,
    );

    try {
      await expect(resolvePlatform(ORG_A1)).resolves.toEqual({
        outcome: 'unresolvable-organization-target',
      });

      await expect(resolveOrdinary(ORG_A1)).rejects.toBeInstanceOf(
        AuditCanonicalWriteInvariantError,
      );
    } finally {
      await testDb.db.execute(
        sql`DELETE FROM auth_organization_identities
            WHERE provider = ${PROVIDER}
              AND external_org_id = ${ORG_A1}`,
      );
    }
  });
});
