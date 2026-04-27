/** @vitest-environment node */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DrizzleWaitlistRepository } from './DrizzleWaitlistRepository';

import { resolveTestDb, type TestDb } from '@/testing/db/create-test-db';

let testDb: TestDb;

beforeAll(async () => {
  testDb = await resolveTestDb();
});

afterAll(async () => {
  await testDb.cleanup();
});

describe('DrizzleWaitlistRepository (real DB)', () => {
  it('adds and finds a waitlist entry by email', async () => {
    const repo = new DrizzleWaitlistRepository(testDb.db);

    const created = await repo.add({
      email: 'waitlist-a@example.com',
      name: 'Waitlist A',
    });
    const found = await repo.findByEmail('waitlist-a@example.com');

    expect(found).not.toBeNull();
    expect(found).toMatchObject({
      id: created.id,
      email: 'waitlist-a@example.com',
      name: 'Waitlist A',
      organizationId: null,
      status: 'pending',
    });
  });

  it('approves a pending waitlist entry', async () => {
    const repo = new DrizzleWaitlistRepository(testDb.db);
    const created = await repo.add({ email: 'waitlist-b@example.com' });
    const approvedAt = new Date('2026-04-26T11:00:00.000Z');

    const approved = await repo.approve(created.id, approvedAt);

    expect(approved.status).toBe('approved');
    expect(approved.approvedAt?.toISOString()).toBe(approvedAt.toISOString());
  });

  it('rejects a pending waitlist entry', async () => {
    const repo = new DrizzleWaitlistRepository(testDb.db);
    const created = await repo.add({ email: 'waitlist-c@example.com' });

    const rejected = await repo.reject(created.id);

    expect(rejected.status).toBe('rejected');
    expect(rejected.approvedAt).toBeNull();
  });

  it('lists only pending waitlist entries', async () => {
    const repo = new DrizzleWaitlistRepository(testDb.db);
    const pending = await repo.add({ email: 'waitlist-d@example.com' });
    const approved = await repo.add({ email: 'waitlist-e@example.com' });
    const rejected = await repo.add({ email: 'waitlist-f@example.com' });

    await repo.approve(approved.id);
    await repo.reject(rejected.id);

    const rows = await repo.listPending();
    const pendingEmails = rows.map((entry) => entry.email);

    expect(pendingEmails).toContain(pending.email);
    expect(pendingEmails).not.toContain(approved.email);
    expect(pendingEmails).not.toContain(rejected.email);
  });
});
