/** @vitest-environment node */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { DrizzleAuditLogReadService } from './DrizzleAuditLogReadService';
import { auditEventsTable } from './schema';

import { resolveTestDb, type TestDb } from '@/testing/db/create-test-db';

let testDb: TestDb;
let svc: DrizzleAuditLogReadService;

beforeAll(async () => {
  testDb = await resolveTestDb();
  svc = new DrizzleAuditLogReadService(testDb.db);
});

afterEach(async () => {
  await testDb.db.delete(auditEventsTable);
});

afterAll(async () => {
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
}) {
  await testDb.db.insert(auditEventsTable).values({
    category: overrides.category ?? 'auth',
    action: 'auth.signin_success',
    outcome: overrides.outcome ?? 'success',
    tenantId: overrides.tenantId === undefined ? 'acme' : overrides.tenantId,
    actorUserId: overrides.actorUserId ?? null,
    targetType: overrides.targetType ?? null,
    targetId: overrides.targetId ?? null,
    occurredAt: overrides.occurredAt ?? new Date(),
  });
}

describe('DrizzleAuditLogReadService (real DB)', () => {
  describe('listGlobal', () => {
    it('returns every event regardless of tenant', async () => {
      await insertEvent({ tenantId: 'acme' });
      await insertEvent({ tenantId: 'globex' });
      await insertEvent({ tenantId: null });

      const { events, total } = await svc.listGlobal(
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

      const { events, total } = await svc.listGlobal(
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

      const page1 = await svc.listGlobal({}, { limit: 2, offset: 0 });
      expect(page1.total).toBe(3);
      expect(page1.events).toHaveLength(2);
      expect(page1.events[0]?.occurredAt).toBe(
        new Date(base.getTime() + 3000).toISOString(),
      );

      const page2 = await svc.listGlobal({}, { limit: 2, offset: 2 });
      expect(page2.events).toHaveLength(1);
      expect(page2.events[0]?.occurredAt).toBe(
        new Date(base.getTime() + 1000).toISOString(),
      );
    });
  });

  describe('listForTenant', () => {
    it('SEC-26: never returns another tenant or null-tenant rows', async () => {
      await insertEvent({ tenantId: 'acme' });
      await insertEvent({ tenantId: 'globex' });
      await insertEvent({ tenantId: null });

      const { events, total } = await svc.listForTenant(
        'acme',
        {},
        { limit: 50, offset: 0 },
      );
      expect(total).toBe(1);
      expect(events).toHaveLength(1);
      expect(events[0]?.tenantId).toBe('acme');
    });

    it('combines the tenant scope with additional filters', async () => {
      await insertEvent({
        tenantId: 'acme',
        targetType: 'user',
        targetId: 'u1',
      });
      await insertEvent({
        tenantId: 'acme',
        targetType: 'user',
        targetId: 'u2',
      });
      await insertEvent({
        tenantId: 'globex',
        targetType: 'user',
        targetId: 'u1',
      });

      const { events, total } = await svc.listForTenant(
        'acme',
        { targetType: 'user', targetId: 'u1' },
        { limit: 50, offset: 0 },
      );
      expect(total).toBe(1);
      expect(events[0]?.tenantId).toBe('acme');
      expect(events[0]?.targetId).toBe('u1');
    });
  });
});
