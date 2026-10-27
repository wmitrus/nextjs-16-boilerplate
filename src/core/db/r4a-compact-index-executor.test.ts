import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  R4aCompactIndexAlreadyRunningError,
  R4aCompactIndexExecutorError,
  runR4aCompactIndexExecutor,
} from './r4a-compact-index-executor';
import type {
  R4aCompactIndexInspection,
  R4aCompactIndexSqlRunner,
} from './r4a-compact-index-inspection';

const { inspect } = vi.hoisted(() => ({ inspect: vi.fn() }));
vi.mock('./r4a-compact-index-inspection', () => ({
  R4A_COMPACT_INDEX_SPECS: [
    {
      table: 'feature_flags',
      index: 'uq_feature_flags_key_organization_compact',
      columns: ['key', 'organization_id'],
    },
    {
      table: 'audit_log_settings',
      index: 'uq_audit_log_settings_category_organization_compact',
      columns: ['category', 'organization_id'],
    },
  ],
  inspectR4aCompactIndex: inspect,
}));

function inspection(
  decision: R4aCompactIndexInspection['decision'],
): R4aCompactIndexInspection {
  return {
    spec: {
      table: 'feature_flags',
      index: 'uq_feature_flags_key_organization_compact',
      columns: ['key', 'organization_id'],
    },
    target: {
      name: 'uq_feature_flags_key_organization_compact',
      exists: decision !== 'eligible-to-create',
      schema: 'public',
      tableSchema: 'public',
      table: 'feature_flags',
      unique: true,
      accessMethod: 'btree',
      keys: [],
      includeColumns: [],
      nullsNotDistinct: true,
      predicate: null,
      valid: decision === 'invalid-index-recovery-required' ? false : true,
      ready: decision === 'invalid-index-recovery-required' ? false : true,
      live: true,
      definition: 'x',
      relationKind: 'i',
      hasPgIndex: true,
      exact: decision !== 'blocked-by-schema-drift',
    },
    requiredLegacyAndSemanticIndexes: [],
    ownership: null,
    catalogAvailable: true,
    decision,
    reasons: [],
  };
}
function runner(
  options: { lock?: boolean; fail?: string } = {},
): R4aCompactIndexSqlRunner & { sql: string[] } {
  const sql: string[] = [];
  return {
    sql,
    query: async <T>(statement: string): Promise<T[]> => {
      sql.push(statement);
      if (options.fail && statement.includes(options.fail))
        throw new Error('db failure');
      if (statement.includes('pg_try_advisory_lock'))
        return [{ ok: options.lock ?? true }] as T[];
      return [] as T[];
    },
  };
}

describe('r4a compact-index executor', () => {
  beforeEach(() => inspect.mockReset());
  it('creates once and reinspects', async () => {
    inspect
      .mockResolvedValueOnce(inspection('eligible-to-create'))
      .mockResolvedValueOnce(inspection('already-converged'));
    const db = runner();
    const result = await runR4aCompactIndexExecutor(db, ['feature_flags']);
    expect(result[0]?.action).toBe('created');
    expect(
      db.sql.filter((sql) =>
        sql.startsWith('CREATE UNIQUE INDEX CONCURRENTLY'),
      ),
    ).toHaveLength(1);
    expect(db.sql.at(-1)).toContain('pg_advisory_unlock');
  });
  it('does no DDL when converged', async () => {
    inspect
      .mockResolvedValueOnce(inspection('already-converged'))
      .mockResolvedValueOnce(inspection('already-converged'));
    const db = runner();
    await runR4aCompactIndexExecutor(db, ['feature_flags']);
    expect(db.sql.some((sql) => /CREATE|DROP INDEX/.test(sql))).toBe(false);
  });
  it.each(['blocked-by-disposition', 'blocked-by-schema-drift'] as const)(
    'refuses %s',
    async (decision) => {
      inspect.mockResolvedValue(inspection(decision));
      const db = runner();
      await expect(
        runR4aCompactIndexExecutor(db, ['feature_flags']),
      ).rejects.toBeInstanceOf(R4aCompactIndexExecutorError);
      expect(db.sql.some((sql) => /CREATE|DROP INDEX/.test(sql))).toBe(false);
    },
  );
  it('recovers only exact invalid not-ready live indexes', async () => {
    inspect
      .mockResolvedValueOnce(inspection('invalid-index-recovery-required'))
      .mockResolvedValueOnce(inspection('already-converged'));
    const db = runner();
    const result = await runR4aCompactIndexExecutor(db, ['feature_flags']);
    expect(result[0]?.action).toBe('recreated-invalid');
    expect(
      db.sql.some((sql) => sql.startsWith('DROP INDEX CONCURRENTLY')),
    ).toBe(true);
  });
  it('releases a held lock when CREATE fails', async () => {
    inspect.mockResolvedValue(inspection('eligible-to-create'));
    const db = runner({ fail: 'CREATE UNIQUE' });
    await expect(
      runR4aCompactIndexExecutor(db, ['feature_flags']),
    ).rejects.toThrow('db failure');
    expect(db.sql.at(-1)).toContain('pg_advisory_unlock');
  });
  it('does not unlock when acquisition fails', async () => {
    const db = runner({ lock: false });
    await expect(
      runR4aCompactIndexExecutor(db, ['feature_flags']),
    ).rejects.toBeInstanceOf(R4aCompactIndexAlreadyRunningError);
    expect(db.sql.some((sql) => sql.includes('pg_advisory_unlock'))).toBe(
      false,
    );
  });
  it('fails on a non-converged postflight', async () => {
    inspect.mockResolvedValue(inspection('eligible-to-create'));
    const db = runner();
    await expect(
      runR4aCompactIndexExecutor(db, ['feature_flags']),
    ).rejects.toThrow('did not converge');
  });
});
