/** @vitest-environment node */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { DrizzleAuditLogReadService } from './DrizzleAuditLogReadService';
import { auditEventsTable } from './schema';

import { usersTable } from '@/modules/user/infrastructure/drizzle/schema';
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

  describe('text match operators (OZI-54)', () => {
    it('exact (default) only matches the full value', async () => {
      await insertEvent({ targetType: 'audit_log_setting' });
      await insertEvent({ targetType: 'audit_log_setting_extra' });

      const { events, total } = await svc.listGlobal(
        { targetType: 'audit_log_setting' },
        { limit: 50, offset: 0 },
      );
      expect(total).toBe(1);
      expect(events[0]?.targetType).toBe('audit_log_setting');
    });

    it('startsWith matches a prefix but not a middle/end substring', async () => {
      await insertEvent({ targetType: 'audit_log_setting' });
      await insertEvent({ targetType: 'organization' });

      const { events, total } = await svc.listGlobal(
        { targetType: 'audit', targetTypeOp: 'startsWith' },
        { limit: 50, offset: 0 },
      );
      expect(total).toBe(1);
      expect(events[0]?.targetType).toBe('audit_log_setting');
    });

    it('contains matches a substring anywhere, backed by the trigram index', async () => {
      await insertEvent({ targetType: 'audit_log_setting' });
      await insertEvent({ targetType: 'organization' });

      const { events, total } = await svc.listGlobal(
        { targetType: 'log', targetTypeOp: 'contains' },
        { limit: 50, offset: 0 },
      );
      expect(total).toBe(1);
      expect(events[0]?.targetType).toBe('audit_log_setting');
    });

    it('escapes literal % and _ in the search value instead of treating them as wildcards', async () => {
      await insertEvent({ targetType: '50%_off' });
      await insertEvent({ targetType: '50Xoff' });

      const { events, total } = await svc.listGlobal(
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

        const { events, total } = await svc.listGlobal(
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
