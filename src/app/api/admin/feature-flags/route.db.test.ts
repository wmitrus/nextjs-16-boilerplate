/** @vitest-environment node */
import { sql } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { INFRASTRUCTURE } from '@/core/contracts';
import type * as EnvModule from '@/core/env';

import { featureFlagsTable } from '@/modules/feature-flags/infrastructure/drizzle/schema';
import { resolveTestDb, type TestDb } from '@/testing/db/create-test-db';
import { makeAllowedProvisioningAccess } from '@/testing/factories/provisioning';

import '@/security/api/with-admin-step-up.mock';
import '@/testing/infrastructure/logger';

// `feature-flags-admin-scope.ts` / `feature-flags-canonical-write.ts` are
// used for REAL in this suite (unlike the fully-mocked `route.test.ts`) --
// both start with `import 'server-only'`, which throws outside a real
// Server Component/route-handler module graph. Neutralize it exactly as
// `feature-flags-canonical-write.db.test.ts` already does.
vi.mock('server-only', () => ({}));

/**
 * OZI-71 FF·D review fix — real-PostgreSQL proof that the POST route's legacy
 * `tenant_id` shadow-write preserves the EXACT FF·B compatibility contract
 * for a platform-admin organization-targeted create, end to end (real
 * `resolveCanonicalFeatureFlagWrite` + real `DrizzleFeatureFlagAdminService`
 * against a real DB — not the mocked unit suite in `route.test.ts`).
 *
 * The regression this guards: writing the organization's canonical parent
 * `TenantId` (`canonical.facts.tenantId`) into the legacy column instead of
 * the raw candidate string collides two sibling organizations under the same
 * tenant on the retained legacy `UNIQUE(key, tenant_id)`, even though the
 * canonical model explicitly permits the same key once per organization.
 *
 * Topology: TENANT_T ┬ ORG_1
 *                     └ ORG_2
 */

let testDb: TestDb;

const TENANT_T = '7171f7f7-7171-4717-8717-717171717171';
const ORG_1 = '01010101-0101-4101-8101-010101010101';
const ORG_2 = '02020202-0202-4202-8202-020202020202';

const mocks = vi.hoisted(() => ({
  connection: vi.fn().mockResolvedValue(undefined),
  resolveAccess: vi.fn(),
  isEnvAdmin: vi.fn(),
  recordAdminAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('next/server', async () => {
  const actual = await vi.importActual('next/server');
  return { ...actual, connection: mocks.connection };
});

vi.mock('@/security/core/node-provisioning-runtime', () => ({
  resolveNodeProvisioningAccess: mocks.resolveAccess,
}));

vi.mock('@/security/core/platform-admin', () => ({
  isEnvBasedPlatformAdmin: mocks.isEnvAdmin,
}));

// Partial mock, not a full replacement: this suite runs a REAL DB migration
// via `resolveTestDb()`, and the real logger setup (`run-migrations.ts` ->
// `resolveServerLogger()`) reads other real `env` fields. Fully replacing the
// module (as the fully-mocked `route.test.ts` does) leaves those `undefined`
// and pino throws during logger init.
vi.mock('@/core/env', async () => {
  const actual = await vi.importActual<typeof EnvModule>('@/core/env');
  return {
    ...actual,
    env: { ...actual.env, FEATURE_FLAG_PROVIDER: 'db', AUTH_PROVIDER: 'clerk' },
  };
});

vi.mock('@/security/actions/record-admin-audit-event', () => ({
  recordAdminAuditEvent: mocks.recordAdminAuditEvent,
}));

// Real container: only INFRASTRUCTURE.DB is ever resolved on the platform-admin
// path (checkAdminAccess short-circuits before AUTHORIZATION.SERVICE).
vi.mock('@/core/runtime/bootstrap', () => ({
  getAppContainer: () => ({
    resolve: (token: symbol) =>
      token === INFRASTRUCTURE.DB ? testDb.db : undefined,
  }),
}));

function makePostRequest(body: unknown) {
  return new NextRequest('http://localhost/api/admin/feature-flags', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const mockContext = { params: Promise.resolve({}) };

beforeAll(async () => {
  testDb = await resolveTestDb();
  await testDb.db.execute(
    sql`INSERT INTO tenants (id, name) VALUES (${TENANT_T}, 'Tenant T')`,
  );
  await testDb.db.execute(
    sql`INSERT INTO organizations (id, tenant_id, name) VALUES
        (${ORG_1}, ${TENANT_T}, 'Org 1'),
        (${ORG_2}, ${TENANT_T}, 'Org 2')`,
  );
});

afterAll(async () => {
  await testDb.db.execute(
    sql`DELETE FROM organizations WHERE id IN (${ORG_1}, ${ORG_2})`,
  );
  await testDb.db.execute(sql`DELETE FROM tenants WHERE id = ${TENANT_T}`);
  await testDb.cleanup();
});

beforeEach(async () => {
  vi.clearAllMocks();
  mocks.connection.mockResolvedValue(undefined);
  mocks.resolveAccess.mockResolvedValue(makeAllowedProvisioningAccess());
  mocks.isEnvAdmin.mockReturnValue(true);
  await testDb.db.delete(featureFlagsTable);
});

describe('POST /api/admin/feature-flags — FF·B legacy tenant_id compatibility contract (real DB)', () => {
  it('sibling organizations under the same tenant: same key succeeds for both, no legacy unique collision', async () => {
    const { POST } = await import('./route');

    const res1 = await POST(
      makePostRequest({
        key: 'shared-key',
        organizationId: ORG_1,
        enabled: true,
      }),
      mockContext,
    );
    expect(res1.status).toBe(201);
    const body1 = (await res1.json()) as {
      data: { flag: { id: string; tenantId: string | null } };
    };

    const res2 = await POST(
      makePostRequest({
        key: 'shared-key',
        organizationId: ORG_2,
        enabled: false,
      }),
      mockContext,
    );
    expect(res2.status).toBe(201);
    const body2 = (await res2.json()) as {
      data: { flag: { id: string; tenantId: string | null } };
    };

    const rows = await testDb.db
      .select()
      .from(featureFlagsTable)
      .where(sql`key = 'shared-key'`);
    expect(rows).toHaveLength(2);

    const rowForOrg1 = rows.find((r) => r.organizationId === ORG_1);
    const rowForOrg2 = rows.find((r) => r.organizationId === ORG_2);
    expect(rowForOrg1).toMatchObject({
      organizationId: ORG_1,
      ownershipState: 'canonical_organization',
    });
    expect(rowForOrg2).toMatchObject({
      organizationId: ORG_2,
      ownershipState: 'canonical_organization',
    });

    // FF·B compatibility contract: the legacy tenant_id shadow value is the
    // RAW candidate the admin supplied (now the organizationId field),
    // verbatim -- never the organizations' shared parent TenantId. This is
    // what keeps the two sibling-org rows from colliding on the retained
    // legacy `UNIQUE(key, tenant_id)`.
    expect(rowForOrg1?.tenantId).toBe(ORG_1);
    expect(rowForOrg2?.tenantId).toBe(ORG_2);
    expect(rowForOrg1?.tenantId).not.toBe(TENANT_T);
    expect(rowForOrg2?.tenantId).not.toBe(TENANT_T);
    expect(body1.data.flag.tenantId).toBe(ORG_1);
    expect(body2.data.flag.tenantId).toBe(ORG_2);

    // OZI-71 FF·D final review — the Audit subsystem (audit_events /
    // audit_log_settings) has NOT undergone AUD·A-D and remains on its own
    // legacy `tenant_id` contract (`resolveEffectiveAuditSetting` matches by
    // exact string equality against `audit_log_settings.tenant_id`). The
    // audit event therefore intentionally carries the SAME opaque legacy
    // shadow value as the DB column (ORG_1 / ORG_2), not the canonical
    // parent TENANT_T. This is proven alongside `organizationId`/
    // `ownershipState` above (asserted against the REAL canonical resolver,
    // not a mock) being correctly ORG_1/ORG_2 + `canonical_organization`
    // regardless — Feature Flag canonical authorization and the Audit
    // subsystem's legacy compatibility key are independently correct, not
    // coupled.
    expect(mocks.recordAdminAuditEvent).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ tenantId: ORG_1 }),
    );
    expect(mocks.recordAdminAuditEvent).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ tenantId: ORG_2 }),
    );
    expect(mocks.recordAdminAuditEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_T }),
    );
  });

  it('canonical reads stay organization-contained for both sibling rows', async () => {
    const { POST } = await import('./route');
    await POST(
      makePostRequest({
        key: 'contained-key',
        organizationId: ORG_1,
        enabled: true,
      }),
      mockContext,
    );
    await POST(
      makePostRequest({
        key: 'contained-key',
        organizationId: ORG_2,
        enabled: false,
      }),
      mockContext,
    );

    const org1Rows = await testDb.db
      .select()
      .from(featureFlagsTable)
      .where(
        sql`key = 'contained-key' and organization_id = ${ORG_1} and ownership_state = 'canonical_organization'`,
      );
    expect(org1Rows).toHaveLength(1);
    expect(org1Rows[0]?.enabled).toBe(true);

    const org2Rows = await testDb.db
      .select()
      .from(featureFlagsTable)
      .where(
        sql`key = 'contained-key' and organization_id = ${ORG_2} and ownership_state = 'canonical_organization'`,
      );
    expect(org2Rows).toHaveLength(1);
    expect(org2Rows[0]?.enabled).toBe(false);
  });

  it('ROLLBACK: a row created via the new organizationId API remains addressable by the pre-FF·D legacy read predicate', async () => {
    const { POST } = await import('./route');
    await POST(
      makePostRequest({
        key: 'rollback-key',
        organizationId: ORG_1,
        enabled: true,
      }),
      mockContext,
    );

    // The pre-FF·D `DrizzleFeatureFlagService.isEnabled` predicate: an exact
    // `tenant_id` match wins over the global (`tenant_id IS NULL`) row.
    // Simulated here (not imported) because the legacy implementation no
    // longer exists in this codebase post-cutover -- this proves the DATA
    // shape a reverted deploy would depend on, not the retired code path.
    const legacyRead = async (legacyTenantId: string) => {
      const rows = await testDb.db.execute(sql`
        SELECT enabled, tenant_id
        FROM feature_flags
        WHERE key = 'rollback-key'
          AND (tenant_id = ${legacyTenantId} OR tenant_id IS NULL)
      `);
      const raw = (
        Array.isArray(rows) ? rows : (rows as { rows?: unknown[] }).rows
      ) as Array<{ enabled: boolean; tenant_id: string | null }>;
      const exact = raw.find((r) => r.tenant_id === legacyTenantId);
      return exact?.enabled ?? raw.find((r) => r.tenant_id === null)?.enabled;
    };

    // A legacy reader that still keys on the admin's original candidate
    // string (exactly what FF·B would have stored) finds the row correctly.
    expect(await legacyRead(ORG_1)).toBe(true);
    // A legacy reader keyed on an unrelated value finds nothing (no global
    // row exists for this key), matching pre-FF·D fail-safe behavior.
    expect(await legacyRead('unrelated-legacy-value')).toBeUndefined();
  });
});
