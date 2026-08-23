/** @vitest-environment node */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { windowStartFor } from '../../domain/DurableRateLimitStore';

import { DrizzleRateLimitStore } from './DrizzleRateLimitStore';

import { resolveTestDb, type TestDb } from '@/testing/db/create-test-db';

let testDb: TestDb;
let store: DrizzleRateLimitStore;

const WINDOW_MS = 60_000;
let uniqueCounter = 0;

/** A fresh identifier per test, so one test's counts cannot leak into another. */
function ident(label: string): string {
  uniqueCounter += 1;
  return `${label}:${uniqueCounter}`;
}

beforeAll(async () => {
  testDb = await resolveTestDb();
  store = new DrizzleRateLimitStore(testDb.db);
});

afterAll(async () => {
  await testDb.cleanup();
});

/**
 * SEC-42. This store only ever runs while the primary is down, which is
 * exactly when it must not quietly lose counts. The properties that matter --
 * atomic increment under concurrency, and a window boundary that actually
 * resets -- are properties of the SQL, so a mocked repository could not
 * demonstrate either.
 */
describe('DrizzleRateLimitStore (real DB)', () => {
  it('counts from one and increments monotonically', async () => {
    const id = ident('seq');

    const first = await store.increment(id, WINDOW_MS);
    const second = await store.increment(id, WINDOW_MS);
    const third = await store.increment(id, WINDOW_MS);

    expect(first.count).toBe(1);
    expect(second.count).toBe(2);
    expect(third.count).toBe(3);
  });

  it('loses no increments when requests overlap', async () => {
    // The reason the implementation is a single INSERT ... ON CONFLICT DO
    // UPDATE rather than SELECT-then-UPDATE. A lost increment on an
    // abuse-control path is a free attempt for the attacker.
    const id = ident('concurrent');

    const results = await Promise.all(
      Array.from({ length: 25 }, () => store.increment(id, WINDOW_MS)),
    );

    const counts = results.map((r) => r.count).sort((a, b) => a - b);
    expect(counts).toEqual(Array.from({ length: 25 }, (_, i) => i + 1));
  });

  it('keeps separate identifiers independent', async () => {
    const a = ident('iso-a');
    const b = ident('iso-b');

    await store.increment(a, WINDOW_MS);
    await store.increment(a, WINDOW_MS);
    const bHit = await store.increment(b, WINDOW_MS);

    expect(bHit.count).toBe(1);
  });

  it('starts a new count in the next window', async () => {
    const id = ident('window');
    const now = new Date('2026-08-23T10:00:30.000Z');
    const nextWindow = new Date(now.getTime() + WINDOW_MS);

    const inFirst = await store.increment(id, WINDOW_MS, now);
    const alsoFirst = await store.increment(id, WINDOW_MS, now);
    const inSecond = await store.increment(id, WINDOW_MS, nextWindow);

    expect(inFirst.count).toBe(1);
    expect(alsoFirst.count).toBe(2);
    expect(inSecond.count).toBe(1);
    expect(inSecond.windowStart.getTime()).toBe(
      inFirst.windowStart.getTime() + WINDOW_MS,
    );
  });

  it('reports a window that ends exactly one window after it starts', async () => {
    const id = ident('bounds');
    const now = new Date('2026-08-23T10:00:45.000Z');

    const hit = await store.increment(id, WINDOW_MS, now);

    expect(hit.windowStart).toEqual(windowStartFor(now, WINDOW_MS));
    expect(hit.windowEnd.getTime() - hit.windowStart.getTime()).toBe(WINDOW_MS);
  });

  it('purges only this identifier’s expired windows', async () => {
    const stale = ident('purge-stale');
    const live = ident('purge-live');
    const old = new Date('2026-08-23T09:00:00.000Z');
    const now = new Date('2026-08-23T10:00:00.000Z');

    await store.increment(stale, WINDOW_MS, old);
    await store.increment(live, WINDOW_MS, old);

    await store.purgeExpired(stale, now);

    // The purged identifier starts over in the old window...
    const staleAgain = await store.increment(stale, WINDOW_MS, old);
    expect(staleAgain.count).toBe(1);

    // ...while an identifier nobody purged keeps its count.
    const liveAgain = await store.increment(live, WINDOW_MS, old);
    expect(liveAgain.count).toBe(2);
  });

  it('does not purge a window that has not expired yet', async () => {
    const id = ident('purge-current');
    const now = new Date('2026-08-23T10:00:10.000Z');

    await store.increment(id, WINDOW_MS, now);
    await store.purgeExpired(id, now);

    const next = await store.increment(id, WINDOW_MS, now);
    expect(next.count).toBe(2);
  });
});
