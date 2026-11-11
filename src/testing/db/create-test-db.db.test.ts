import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import {
  createTestDb,
  resolveMigrationOnlyTestDb,
  type TestDb,
} from './create-test-db';

/**
 * OZI-219 P1 — `createTestDb` truncates every public table, so the target
 * proof must come before it. Run only against a disposable Testcontainers
 * cluster of this file's own (never the shared fixture): a refusal must leave
 * its sentinel row in place; the positive control proves the same call does
 * truncate once the identity matches.
 */
const usesPostgres =
  Boolean(inject('TEST_DATABASE_URL')) ||
  Boolean(process.env.TEST_DATABASE_URL?.trim());
const sharedFixtureIdentity = inject('TEST_DATABASE_SYSTEM_IDENTIFIER') as
  | string
  | undefined;

describe.skipIf(!usesPostgres)(
  'createTestDb target identity before TRUNCATE (OZI-219 P1)',
  () => {
    let target: TestDb;

    beforeAll(async () => {
      target = await resolveMigrationOnlyTestDb();
      await target.db.execute(
        sql`CREATE TABLE public.ozi219_truncate_sentinel (id int)`,
      );
    });

    afterAll(async () => {
      await target?.cleanup();
    });

    async function sentinelRows(): Promise<number> {
      const rows = (await target.db.execute(
        sql`SELECT count(*)::int AS n FROM public.ozi219_truncate_sentinel`,
      )) as unknown as { n: number }[];
      return rows[0]!.n;
    }

    async function withSentinel(attempt: () => Promise<unknown>) {
      await target.db.execute(
        sql`INSERT INTO public.ozi219_truncate_sentinel VALUES (1)`,
      );
      const before = await sentinelRows();
      await expect(attempt()).rejects.toThrow(/refused/);
      expect(await sentinelRows()).toBe(before);
    }

    it('refuses a wrong system_identifier and truncates nothing', async () => {
      await withSentinel(() =>
        createTestDb('postgres', target.url, { systemIdentifier: '1' }),
      );
    });

    it.skipIf(!sharedFixtureIdentity)(
      "refuses another real cluster's identity (default injected one) and truncates nothing",
      async () => {
        expect(sharedFixtureIdentity).not.toBe(target.systemIdentifier);
        await withSentinel(() => createTestDb('postgres', target.url));
      },
    );

    it('refuses a missing identity and truncates nothing', async () => {
      await withSentinel(() =>
        createTestDb('postgres', target.url, { systemIdentifier: '' }),
      );
    });

    it('refuses a malformed identity (no SQL reaches the server)', async () => {
      await withSentinel(() =>
        createTestDb('postgres', target.url, {
          systemIdentifier: "1' OR true --",
        }),
      );
    });

    it('refuses a non-loopback URL before connecting', async () => {
      const remote = new URL(target.url!);
      remote.hostname = 'db.example.invalid';
      await withSentinel(() =>
        createTestDb('postgres', remote.toString(), {
          systemIdentifier: target.systemIdentifier,
        }),
      );
    });

    it('positive control: the matching identity truncates', async () => {
      await target.db.execute(
        sql`INSERT INTO public.ozi219_truncate_sentinel VALUES (1)`,
      );
      const proven = await createTestDb('postgres', target.url, {
        systemIdentifier: target.systemIdentifier,
      });
      try {
        expect(await sentinelRows()).toBe(0);
      } finally {
        await proven.cleanup();
      }
    });
  },
);
