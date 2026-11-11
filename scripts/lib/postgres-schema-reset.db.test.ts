import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import { resetPostgresSchema } from './postgres-schema-reset';

import {
  resolveMigrationOnlyTestDb,
  type TestDb,
} from '@/testing/db/create-test-db';

/**
 * OZI-219 P1 — `postgres-schema-reset` drops `public` and `drizzle`. It must
 * verify the cluster identity on its own connection before the first DROP.
 * Run only against a disposable Testcontainers cluster of this file's own:
 * every refusal must leave the schema (sentinel table + drizzle journal)
 * intact; the positive control, last, proves the reset does run on a match.
 */
const usesPostgres =
  Boolean(inject('TEST_DATABASE_URL')) ||
  Boolean(process.env.TEST_DATABASE_URL?.trim());
const sharedFixtureIdentity = inject('TEST_DATABASE_SYSTEM_IDENTIFIER') as
  | string
  | undefined;

describe.skipIf(!usesPostgres)(
  'postgres-schema-reset target identity before DROP (OZI-219 P1)',
  () => {
    let target: TestDb;

    beforeAll(async () => {
      target = await resolveMigrationOnlyTestDb();
      await target.db.execute(
        sql`CREATE TABLE public.ozi219_reset_sentinel (id int)`,
      );
      await target.db.execute(
        sql`INSERT INTO public.ozi219_reset_sentinel VALUES (1)`,
      );
    });

    afterAll(async () => {
      await target?.cleanup();
    });

    async function schemaState() {
      const rows = (await target.db.execute(sql`
        SELECT to_regclass('public.ozi219_reset_sentinel') IS NOT NULL AS sentinel,
               to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS journal`)) as unknown as {
        sentinel: boolean;
        journal: boolean;
      }[];
      return rows[0]!;
    }

    async function expectRefusedUnchanged(identity: string | undefined) {
      expect(await schemaState()).toEqual({ sentinel: true, journal: true });
      await expect(resetPostgresSchema(target.url!, identity)).rejects.toThrow(
        /refused, nothing dropped/,
      );
      expect(await schemaState()).toEqual({ sentinel: true, journal: true });
      const rows = (await target.db.execute(
        sql`SELECT count(*)::int AS n FROM public.ozi219_reset_sentinel`,
      )) as unknown as { n: number }[];
      expect(rows[0]!.n).toBe(1);
    }

    it('refuses a wrong system_identifier and drops nothing', async () => {
      await expectRefusedUnchanged('1');
    });

    it.skipIf(!sharedFixtureIdentity)(
      "refuses another real cluster's identity and drops nothing",
      async () => {
        expect(sharedFixtureIdentity).not.toBe(target.systemIdentifier);
        await expectRefusedUnchanged(sharedFixtureIdentity);
      },
    );

    it('refuses a missing identity and drops nothing', async () => {
      await expectRefusedUnchanged(undefined);
      await expectRefusedUnchanged('');
    });

    it('refuses a malformed identity and drops nothing', async () => {
      await expectRefusedUnchanged("1' OR true --");
    });

    it('positive control: the matching identity resets the schema', async () => {
      // The reset GRANTs to the compose superuser `postgres`; this disposable
      // Testcontainers cluster has a different superuser, so add the role.
      await target.db.execute(sql`
        DO $$ BEGIN
          IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'postgres') THEN
            CREATE ROLE postgres;
          END IF;
        END $$`);
      await resetPostgresSchema(target.url!, target.systemIdentifier);
      expect(await schemaState()).toEqual({ sentinel: false, journal: false });
    });
  },
);
