import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  R4aCompactIndexAlreadyRunningError,
  R4aCompactIndexExecutorError,
  runR4aCompactIndexExecutor,
  type R4aCompactIndexExecutorRunner,
} from './r4a-compact-index-executor';
import type { R4aCompactIndexInspection } from './r4a-compact-index-inspection';

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
  options: {
    lock?: boolean;
    fail?: string;
    settings?: Record<string, unknown>;
    /** Successive answers of the session-lock check; true once exhausted. */
    held?: boolean[];
  } = {},
): R4aCompactIndexExecutorRunner & {
  sql: string[];
  params: (readonly string[])[];
} {
  const sql: string[] = [];
  const params: (readonly string[])[] = [];
  return {
    sql,
    params,
    queryWithParams: async <T>(
      statement: string,
      values: readonly string[],
    ): Promise<T[]> => {
      sql.push(statement);
      params.push(values);
      if (options.fail && statement.includes(options.fail))
        throw new Error('db failure');
      return [] as T[];
    },
    query: async <T>(statement: string): Promise<T[]> => {
      sql.push(statement);
      if (options.fail && statement.includes(options.fail))
        throw new Error('db failure');
      if (statement.includes('pg_try_advisory_lock'))
        return [{ ok: options.lock ?? true }] as T[];
      if (statement.includes('FROM pg_locks'))
        return [{ held: options.held?.shift() ?? true }] as T[];
      if (statement.includes("current_setting('lock_timeout')"))
        return [
          options.settings ?? {
            lock_timeout: "5s'x",
            statement_timeout: '1min',
          },
        ] as T[];
      return [] as T[];
    },
  };
}
const ddl = (sql: readonly string[]) =>
  sql.filter((statement) => /CREATE UNIQUE INDEX|DROP INDEX/.test(statement));
const firstIndex = (sql: readonly string[], fragment: string) =>
  sql.findIndex((statement) => statement.includes(fragment));
const RESTORE =
  "SELECT set_config('lock_timeout', $1, false), set_config('statement_timeout', $2, false)";

describe('r4a compact-index executor', () => {
  beforeEach(() => {
    inspect.mockReset();
  });
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

  describe('session timeouts', () => {
    it('applies the policy after the lock and before the first preflight', async () => {
      const db = runner();
      let seenAtPreflight: string[] = [];
      inspect.mockImplementation(async () => {
        if (seenAtPreflight.length === 0) seenAtPreflight = [...db.sql];
        return inspection('already-converged');
      });
      await runR4aCompactIndexExecutor(db, ['feature_flags']);
      const lock = firstIndex(seenAtPreflight, 'pg_try_advisory_lock');
      expect(lock).toBe(0);
      expect(firstIndex(seenAtPreflight, 'SET lock_timeout = 3000')).toBe(
        lock + 2,
      );
      expect(firstIndex(seenAtPreflight, 'SET statement_timeout = 0')).toBe(
        lock + 3,
      );
      expect(db.sql.slice(-2)).toEqual([
        RESTORE,
        expect.stringContaining('pg_advisory_unlock'),
      ]);
    });

    it('runs recovery DROP/CREATE under the active policy', async () => {
      inspect
        .mockResolvedValueOnce(inspection('invalid-index-recovery-required'))
        .mockResolvedValueOnce(inspection('already-converged'));
      const db = runner();
      await runR4aCompactIndexExecutor(db, ['feature_flags']);
      const drop = firstIndex(db.sql, 'DROP INDEX CONCURRENTLY');
      expect(firstIndex(db.sql, 'SET lock_timeout')).toBeLessThan(drop);
      expect(firstIndex(db.sql, 'SET statement_timeout')).toBeLessThan(drop);
      expect(firstIndex(db.sql, 'set_config')).toBeGreaterThan(drop);
    });

    it('restores settings and releases the lock when a preflight times out', async () => {
      inspect.mockImplementation(async () => {
        throw new Error('canceling statement due to lock timeout');
      });
      const db = runner();
      await expect(
        runR4aCompactIndexExecutor(db, ['feature_flags']),
      ).rejects.toThrow('lock timeout');
      expect(ddl(db.sql)).toEqual([]);
      expect(db.sql.slice(-2)).toEqual([
        RESTORE,
        expect.stringContaining('pg_advisory_unlock'),
      ]);
    });

    it('refuses to inspect or run DDL when applying a timeout fails', async () => {
      const db = runner({ fail: 'SET statement_timeout' });
      await expect(
        runR4aCompactIndexExecutor(db, ['feature_flags']),
      ).rejects.toThrow('db failure');
      expect(inspect).not.toHaveBeenCalled();
      expect(ddl(db.sql)).toEqual([]);
      expect(db.sql.slice(-2)).toEqual([
        RESTORE,
        expect.stringContaining('pg_advisory_unlock'),
      ]);
    });

    it.each([
      ['a failed read', { fail: "current_setting('lock_timeout')" }],
      ['an unreadable row', { settings: { lock_timeout: null } }],
    ])(
      'fails closed on %s of the current settings',
      async (_label, options) => {
        const db = runner(options);
        await expect(
          runR4aCompactIndexExecutor(db, ['feature_flags']),
        ).rejects.toThrow();
        expect(inspect).not.toHaveBeenCalled();
        expect(db.sql.some((sql) => sql.startsWith('SET '))).toBe(false);
        expect(db.sql.some((sql) => sql.includes('set_config'))).toBe(false);
        expect(db.sql.at(-1)).toContain('pg_advisory_unlock');
      },
    );

    it.each([
      ['ordinary values', '5s', '1min'],
      ['apostrophes', "5s'x", "1min''"],
      [
        'an injection attempt',
        "0'; DROP TABLE public.feature_flags; --",
        '$1 \' \\ " ; SELECT pg_sleep(10)',
      ],
    ])(
      'restores %s through a constant, parameterized statement',
      async (_label, lockTimeout, statementTimeout) => {
        inspect.mockResolvedValue(inspection('already-converged'));
        const db = runner({
          settings: {
            lock_timeout: lockTimeout,
            statement_timeout: statementTimeout,
          },
        });
        await runR4aCompactIndexExecutor(db, ['feature_flags']);
        expect(db.sql.filter((sql) => sql.includes('set_config'))).toEqual([
          RESTORE,
        ]);
        expect(db.params).toEqual([[lockTimeout, statementTimeout]]);
        for (const value of [lockTimeout, statementTimeout])
          expect(db.sql.some((sql) => sql.includes(value))).toBe(false);
      },
    );

    it('refuses a runner that cannot bind parameters before any SQL', async () => {
      const db = runner();
      const { queryWithParams: _unsupported, ...plain } = db;
      await expect(
        runR4aCompactIndexExecutor(
          plain as unknown as R4aCompactIndexExecutorRunner,
          ['feature_flags'],
        ),
      ).rejects.toThrow('cannot bind query parameters');
      expect(db.sql).toEqual([]);
      expect(inspect).not.toHaveBeenCalled();
    });

    it('still releases the lock when restoring the settings fails', async () => {
      inspect.mockResolvedValue(inspection('already-converged'));
      const db = runner({ fail: 'set_config' });
      await expect(
        runR4aCompactIndexExecutor(db, ['feature_flags']),
      ).rejects.toThrow('db failure');
      expect(db.sql.at(-1)).toContain('pg_advisory_unlock');
    });
  });

  describe('session pinning', () => {
    const lost = 'no longer holds the advisory lock';

    it('checks the session lock before the preflight and before CREATE', async () => {
      inspect
        .mockResolvedValueOnce(inspection('eligible-to-create'))
        .mockResolvedValueOnce(inspection('already-converged'));
      const db = runner();
      await runR4aCompactIndexExecutor(db, ['feature_flags']);
      const create = firstIndex(db.sql, 'CREATE UNIQUE INDEX');
      expect(db.sql[create - 1]).toContain('FROM pg_locks');
      expect(db.sql[create - 1]).toContain('pid = pg_backend_pid()');
    });

    it('refuses CREATE when the session lost its lock after the preflight', async () => {
      inspect.mockResolvedValue(inspection('eligible-to-create'));
      const db = runner({ held: [true, false] });
      await expect(
        runR4aCompactIndexExecutor(db, ['feature_flags']),
      ).rejects.toThrow(lost);
      expect(ddl(db.sql)).toEqual([]);
      expect(db.sql.slice(-2)).toEqual([
        RESTORE,
        expect.stringContaining('pg_advisory_unlock'),
      ]);
    });

    it('refuses the next table when the session changed after the first one', async () => {
      inspect
        .mockResolvedValueOnce(inspection('eligible-to-create'))
        .mockResolvedValueOnce(inspection('already-converged'))
        .mockResolvedValue(inspection('eligible-to-create'));
      const db = runner({ held: [true, true, false] });
      await expect(
        runR4aCompactIndexExecutor(db, ['feature_flags', 'audit_log_settings']),
      ).rejects.toThrow(lost);
      expect(ddl(db.sql)).toHaveLength(1);
      expect(inspect).toHaveBeenCalledTimes(2);
    });

    it('does not CREATE after DROP when the session lock is lost in between', async () => {
      inspect.mockResolvedValue(inspection('invalid-index-recovery-required'));
      const db = runner({ held: [true, true, false] });
      await expect(
        runR4aCompactIndexExecutor(db, ['feature_flags']),
      ).rejects.toThrow(lost);
      expect(ddl(db.sql)).toEqual([
        'DROP INDEX CONCURRENTLY "public"."uq_feature_flags_key_organization_compact"',
      ]);
    });
  });
});
