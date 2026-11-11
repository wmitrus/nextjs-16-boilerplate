/** @vitest-environment node */
import type { Sql } from 'postgres';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import type { R4aCompactIndexSqlRunner } from './r4a-compact-index-inspection';
import { inspectR4aCompactIndex } from './r4a-compact-index-inspection';

import { startIsolatedPostgres } from '@/testing/db/isolated-postgres';

/**
 * PostgreSQL catalog proof. Test-only DDL is contained in a rolled-back
 * transaction; production-facing inspector code remains SELECT-only.
 */
const testUrl =
  (inject('TEST_DATABASE_URL') as string | undefined) ??
  process.env.TEST_DATABASE_URL?.trim();

let closeClient: (() => Promise<void>) | undefined;
let client: Sql | undefined;

beforeAll(async () => {
  if (!testUrl) return;
  // OZI-219: the inspector's pre-A decisions (eligible-to-create, NOT VALID
  // CHECKs) need a migration-only database; the shared fixture is schema A.
  const isolated = await startIsolatedPostgres({ r4aSchemaA: 'absent' });
  const { default: postgres } = await import('postgres');
  client = postgres(isolated.url, { max: 1 });
  closeClient = async () => {
    await client!.end();
    await isolated.stop();
  };
});

afterAll(async () => {
  await closeClient?.();
});

describe.skipIf(!testUrl)(
  'r4a-compact-index-inspection — real PostgreSQL',
  () => {
    it('recognizes real retained indexes and plans creation after table-specific validation evidence', async () => {
      const connection = await client!.reserve();
      try {
        await connection.unsafe('BEGIN');
        await connection.unsafe(
          'ALTER TABLE public.feature_flags VALIDATE CONSTRAINT ck_feature_flags_ownership_state_org',
        );
        const runner: R4aCompactIndexSqlRunner = {
          query: async <T>(statement: string) =>
            (await connection.unsafe(statement)) as T[],
        };
        const result = await inspectR4aCompactIndex(runner, 'feature_flags');
        expect(result).toMatchObject({
          decision: 'eligible-to-create',
          ownership: { gateReady: true, table: 'feature_flags' },
        });
        expect(
          result.requiredLegacyAndSemanticIndexes.every(
            (index) => index.exact && index.valid && index.ready,
          ),
        ).toBe(true);
      } finally {
        await connection.unsafe('ROLLBACK');
        connection.release();
      }
    });

    it('reads actual compact-index state and refuses to involve audit_events', async () => {
      const connection = await client!.reserve();
      try {
        await connection.unsafe('BEGIN');
        await connection.unsafe(
          'ALTER TABLE public.audit_log_settings VALIDATE CONSTRAINT ck_audit_log_settings_ownership_state_org',
        );
        await connection.unsafe(
          'CREATE UNIQUE INDEX uq_audit_log_settings_category_organization_compact ON public.audit_log_settings USING btree (category, organization_id) NULLS NOT DISTINCT',
        );
        const queries: string[] = [];
        const runner: R4aCompactIndexSqlRunner = {
          query: async <T>(statement: string) => {
            queries.push(statement);
            return (await connection.unsafe(statement)) as T[];
          },
        };
        await expect(
          inspectR4aCompactIndex(runner, 'audit_log_settings'),
        ).resolves.toMatchObject({ decision: 'already-converged' });
        expect(queries.join('\n')).not.toContain('audit_events');
      } finally {
        await connection.unsafe('ROLLBACK');
        connection.release();
      }
    });

    it.each([
      [
        'an INCLUDE column',
        'CREATE UNIQUE INDEX uq_feature_flags_key_organization_compact ON public.feature_flags USING btree (key, organization_id) INCLUDE (tenant_id) NULLS NOT DISTINCT',
      ],
      [
        'an expression key',
        'CREATE UNIQUE INDEX uq_feature_flags_key_organization_compact ON public.feature_flags USING btree ((lower(key)), organization_id) NULLS NOT DISTINCT',
      ],
    ])('rejects a real compact index with %s', async (_label, ddl) => {
      const connection = await client!.reserve();
      try {
        await connection.unsafe('BEGIN');
        await connection.unsafe(
          'ALTER TABLE public.feature_flags VALIDATE CONSTRAINT ck_feature_flags_ownership_state_org',
        );
        await connection.unsafe(ddl);
        const runner: R4aCompactIndexSqlRunner = {
          query: async <T>(statement: string) =>
            (await connection.unsafe(statement)) as T[],
        };
        await expect(
          inspectR4aCompactIndex(runner, 'feature_flags'),
        ).resolves.toMatchObject({ decision: 'blocked-by-schema-drift' });
      } finally {
        await connection.unsafe('ROLLBACK');
        connection.release();
      }
    });

    it('rejects a real public relation-name collision that is not an index', async () => {
      const connection = await client!.reserve();
      try {
        await connection.unsafe('BEGIN');
        await connection.unsafe(
          'ALTER TABLE public.feature_flags VALIDATE CONSTRAINT ck_feature_flags_ownership_state_org',
        );
        await connection.unsafe(
          'CREATE VIEW public.uq_feature_flags_key_organization_compact AS SELECT 1 AS value',
        );
        const runner: R4aCompactIndexSqlRunner = {
          query: async <T>(statement: string) =>
            (await connection.unsafe(statement)) as T[],
        };
        await expect(
          inspectR4aCompactIndex(runner, 'feature_flags'),
        ).resolves.toMatchObject({ decision: 'blocked-by-schema-drift' });
      } finally {
        await connection.unsafe('ROLLBACK');
        connection.release();
      }
    });
  },
);
