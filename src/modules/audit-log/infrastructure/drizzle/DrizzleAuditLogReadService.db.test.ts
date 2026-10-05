/** @vitest-environment node */
import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
  internalOrganizationIdFromOrgRow,
  parentTenantIdFromOrgRow,
} from '@/core/contracts/canonical-ids.provenance';

import {
  DrizzleAuditLogReadService,
  type AuditLogsDataScope,
} from './DrizzleAuditLogReadService';
import { auditEventsTable } from './schema';

import { usersTable } from '@/modules/user/infrastructure/drizzle/schema';
import { resolveTestDb, type TestDb } from '@/testing/db/create-test-db';

let testDb: TestDb;
let svc: DrizzleAuditLogReadService;

const TENANT_A = '71000000-0000-4000-8000-000000000001';
const TENANT_B = '71000000-0000-4000-8000-000000000002';
const ORG_A1 = '75000000-0000-4000-8000-000000000001';
const ORG_A2 = '75000000-0000-4000-8000-000000000002';
const ORG_B1 = '75000000-0000-4000-8000-000000000003';

function organizationScope(
  organizationId: string,
  tenantId: string,
): AuditLogsDataScope {
  return {
    kind: 'organization',
    organizationId: internalOrganizationIdFromOrgRow(organizationId),
    tenantId: parentTenantIdFromOrgRow(tenantId),
  };
}

const PLATFORM_GLOBAL_SCOPE: AuditLogsDataScope = {
  kind: 'platform-global',
};

beforeAll(async () => {
  testDb = await resolveTestDb();
  svc = new DrizzleAuditLogReadService(testDb.db);

  await testDb.db.execute(sql`
    INSERT INTO tenants (id, name)
    VALUES
      (${TENANT_A}, 'Audit Read Tenant A'),
      (${TENANT_B}, 'Audit Read Tenant B')
  `);

  await testDb.db.execute(sql`
    INSERT INTO organizations (id, tenant_id, name)
    VALUES
      (${ORG_A1}, ${TENANT_A}, 'Audit Read Org A1'),
      (${ORG_A2}, ${TENANT_A}, 'Audit Read Org A2'),
      (${ORG_B1}, ${TENANT_B}, 'Audit Read Org B1')
  `);
});

afterEach(async () => {
  await testDb.db.delete(auditEventsTable);
});

afterAll(async () => {
  await testDb.db.execute(sql`
    DELETE FROM organizations
    WHERE id IN (${ORG_A1}, ${ORG_A2}, ${ORG_B1})
  `);
  await testDb.db.execute(sql`
    DELETE FROM tenants
    WHERE id IN (${TENANT_A}, ${TENANT_B})
  `);
  await testDb.cleanup();
});

async function insertEvent(overrides: {
  category?: 'auth' | 'billing' | 'waitlist';
  outcome?: 'success' | 'failure' | 'denied';
  tenantId?: string | null;
  actorUserId?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  occurredAt?: Date;
  organizationId?: string | null;
  ownershipState?:
    | 'canonical_organization'
    | 'organization_owned_orphaned'
    | 'intentional_global'
    | 'unresolved_legacy'
    | 'quarantined';
}) {
  await testDb.db.insert(auditEventsTable).values({
    category: overrides.category ?? 'auth',
    action: 'auth.signin_success',
    outcome: overrides.outcome ?? 'success',
    tenantId: overrides.tenantId === undefined ? 'acme' : overrides.tenantId,
    organizationId: overrides.organizationId ?? null,
    ownershipState: overrides.ownershipState ?? 'unresolved_legacy',
    actorUserId: overrides.actorUserId ?? null,
    targetType: overrides.targetType ?? null,
    targetId: overrides.targetId ?? null,
    occurredAt: overrides.occurredAt ?? new Date(),
  });
}

describe('DrizzleAuditLogReadService (real DB)', () => {
  describe('list(platform-global)', () => {
    it('returns every event for explicit platform-global scope', async () => {
      await insertEvent({ tenantId: 'acme' });
      await insertEvent({ tenantId: 'globex' });
      await insertEvent({ tenantId: null });

      const { events, total } = await svc.list(
        PLATFORM_GLOBAL_SCOPE,
        {},
        { limit: 50, offset: 0 },
      );
      expect(total).toBe(3);
      expect(events).toHaveLength(3);
    });

    it('applies category and outcome filters', async () => {
      await insertEvent({ category: 'auth', outcome: 'success' });
      await insertEvent({ category: 'auth', outcome: 'failure' });
      await insertEvent({ category: 'billing', outcome: 'success' });

      const { events, total } = await svc.list(
        PLATFORM_GLOBAL_SCOPE,
        { category: 'auth', outcome: 'failure' },
        { limit: 50, offset: 0 },
      );
      expect(total).toBe(1);
      expect(events[0]?.category).toBe('auth');
      expect(events[0]?.outcome).toBe('failure');
    });

    it('orders newest first and paginates with limit/offset', async () => {
      const base = new Date('2026-01-01T00:00:00Z');
      await insertEvent({ occurredAt: new Date(base.getTime() + 1000) });
      await insertEvent({ occurredAt: new Date(base.getTime() + 2000) });
      await insertEvent({ occurredAt: new Date(base.getTime() + 3000) });

      const page1 = await svc.list(
        PLATFORM_GLOBAL_SCOPE,
        {},
        { limit: 2, offset: 0 },
      );
      expect(page1.total).toBe(3);
      expect(page1.events).toHaveLength(2);
      expect(page1.events[0]?.occurredAt).toBe(
        new Date(base.getTime() + 3000).toISOString(),
      );

      const page2 = await svc.list(
        PLATFORM_GLOBAL_SCOPE,
        {},
        { limit: 2, offset: 2 },
      );
      expect(page2.events).toHaveLength(1);
      expect(page2.events[0]?.occurredAt).toBe(
        new Date(base.getTime() + 1000).toISOString(),
      );
    });
  });

  describe('canonical DataScope (OZI-71 AUD·D)', () => {
    it('platform-global scope keeps the existing unrestricted viewer semantics', async () => {
      await insertEvent({
        tenantId: 'legacy-a1',
        organizationId: ORG_A1,
        ownershipState: 'canonical_organization',
      });
      await insertEvent({
        tenantId: null,
        ownershipState: 'intentional_global',
      });
      await insertEvent({
        tenantId: 'historical-unresolved',
        ownershipState: 'unresolved_legacy',
      });

      const { events, total } = await svc.list(
        PLATFORM_GLOBAL_SCOPE,
        {},
        { limit: 50, offset: 0 },
      );

      expect(total).toBe(3);
      expect(events).toHaveLength(3);
    });

    it('organization scope returns only that canonical organization, never sibling/global/legacy rows', async () => {
      await insertEvent({
        tenantId: 'legacy-a1',
        organizationId: ORG_A1,
        ownershipState: 'canonical_organization',
      });
      await insertEvent({
        tenantId: 'legacy-a2',
        organizationId: ORG_A2,
        ownershipState: 'canonical_organization',
      });
      await insertEvent({
        tenantId: 'legacy-b1',
        organizationId: ORG_B1,
        ownershipState: 'canonical_organization',
      });
      await insertEvent({
        tenantId: null,
        ownershipState: 'intentional_global',
      });
      await insertEvent({
        tenantId: 'historical-unresolved',
        ownershipState: 'unresolved_legacy',
      });

      const { events, total } = await svc.list(
        organizationScope(ORG_A1, TENANT_A),
        {},
        { limit: 50, offset: 0 },
      );

      expect(total).toBe(1);
      expect(events).toHaveLength(1);
      expect(events[0]?.tenantId).toBe('legacy-a1');
    });

    it('fails closed for an internally inconsistent organization/tenant tuple with no global fallback', async () => {
      await insertEvent({
        tenantId: 'legacy-a1',
        organizationId: ORG_A1,
        ownershipState: 'canonical_organization',
      });
      await insertEvent({
        tenantId: null,
        ownershipState: 'intentional_global',
      });

      const { events, total } = await svc.list(
        organizationScope(ORG_A1, TENANT_B),
        {},
        { limit: 50, offset: 0 },
      );

      expect(total).toBe(0);
      expect(events).toEqual([]);
    });

    it('intersects canonical organization containment with ordinary filters', async () => {
      await insertEvent({
        tenantId: 'legacy-a1',
        organizationId: ORG_A1,
        ownershipState: 'canonical_organization',
        targetType: 'user',
        targetId: 'wanted',
      });
      await insertEvent({
        tenantId: 'legacy-a1',
        organizationId: ORG_A1,
        ownershipState: 'canonical_organization',
        targetType: 'user',
        targetId: 'other',
      });
      await insertEvent({
        tenantId: 'legacy-a2',
        organizationId: ORG_A2,
        ownershipState: 'canonical_organization',
        targetType: 'user',
        targetId: 'wanted',
      });

      const { events, total } = await svc.list(
        organizationScope(ORG_A1, TENANT_A),
        { targetType: 'user', targetId: 'wanted' },
        { limit: 50, offset: 0 },
      );

      expect(total).toBe(1);
      expect(events[0]?.targetId).toBe('wanted');
      expect(events[0]?.tenantId).toBe('legacy-a1');
    });
  });

  describe('text match operators (OZI-54)', () => {
    it('exact (default) only matches the full value', async () => {
      await insertEvent({ targetType: 'audit_log_setting' });
      await insertEvent({ targetType: 'audit_log_setting_extra' });

      const { events, total } = await svc.list(
        PLATFORM_GLOBAL_SCOPE,
        { targetType: 'audit_log_setting' },
        { limit: 50, offset: 0 },
      );
      expect(total).toBe(1);
      expect(events[0]?.targetType).toBe('audit_log_setting');
    });

    it('startsWith matches a prefix but not a middle/end substring', async () => {
      await insertEvent({ targetType: 'audit_log_setting' });
      await insertEvent({ targetType: 'organization' });

      const { events, total } = await svc.list(
        PLATFORM_GLOBAL_SCOPE,
        { targetType: 'audit', targetTypeOp: 'startsWith' },
        { limit: 50, offset: 0 },
      );
      expect(total).toBe(1);
      expect(events[0]?.targetType).toBe('audit_log_setting');
    });

    it('contains matches a substring anywhere, backed by the trigram index', async () => {
      await insertEvent({ targetType: 'audit_log_setting' });
      await insertEvent({ targetType: 'organization' });

      const { events, total } = await svc.list(
        PLATFORM_GLOBAL_SCOPE,
        { targetType: 'log', targetTypeOp: 'contains' },
        { limit: 50, offset: 0 },
      );
      expect(total).toBe(1);
      expect(events[0]?.targetType).toBe('audit_log_setting');
    });

    it('escapes literal % and _ in the search value instead of treating them as wildcards', async () => {
      await insertEvent({ targetType: '50%_off' });
      await insertEvent({ targetType: '50Xoff' });

      const { events, total } = await svc.list(
        PLATFORM_GLOBAL_SCOPE,
        { targetType: '%_', targetTypeOp: 'contains' },
        { limit: 50, offset: 0 },
      );
      expect(total).toBe(1);
      expect(events[0]?.targetType).toBe('50%_off');
    });

    it('contains works on the native uuid actorUserId column via an explicit text cast', async () => {
      // actorUserId is a real FK to users.id -- needs actual rows there,
      // unlike the other filter columns.
      const actorId = '11111111-2222-4333-8444-555555555555';
      const otherActorId = '99999999-2222-4333-8444-555555555555';
      await testDb.db.insert(usersTable).values([
        { id: actorId, email: 'trgm-actor-1@example.test' },
        { id: otherActorId, email: 'trgm-actor-2@example.test' },
      ]);

      try {
        await insertEvent({ actorUserId: actorId });
        await insertEvent({ actorUserId: otherActorId });

        const { events, total } = await svc.list(
          PLATFORM_GLOBAL_SCOPE,
          { actorUserId: '2222-4333-8444', actorUserIdOp: 'contains' },
          { limit: 50, offset: 0 },
        );
        expect(total).toBe(2);
        expect(events.map((e) => e.actorUserId).sort()).toEqual(
          [actorId, otherActorId].sort(),
        );
      } finally {
        await testDb.db.delete(auditEventsTable);
        await testDb.db.delete(usersTable);
      }
    });
  });
});
