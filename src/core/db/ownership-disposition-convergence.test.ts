import { describe, expect, it } from 'vitest';

import {
  OWNERSHIP_DISPOSITION_ADVISORY_LOCK_KEY,
  OwnershipDispositionConvergenceAlreadyRunningError,
  runOwnershipDispositionConvergence,
} from './ownership-disposition-convergence';
import type {
  OwnershipDispositionEvidence,
  OwnershipDispositionTableEvidence,
} from './ownership-disposition-gate';
import type { SqlRunner } from './post-migrate-steps';

function table(
  name: 'feature_flags' | 'audit_log_settings' | 'audit_events',
  over: Partial<OwnershipDispositionTableEvidence> = {},
): OwnershipDispositionTableEvidence {
  const gate = name === 'audit_events' ? 'r4b1' : 'r4a';

  return {
    table: name,
    gate,
    counts: {
      total: 0,
      canonicalOrganization: 0,
      intentionalGlobal: 0,
      unresolvedLegacy: 0,
      quarantined: 0,
      organizationOwnedOrphaned: 0,
    },
    invalidCombinationCount: 0,
    constraint: {
      name:
        name === 'feature_flags'
          ? 'ck_feature_flags_ownership_state_org'
          : name === 'audit_log_settings'
            ? 'ck_audit_log_settings_ownership_state_org'
            : 'ck_audit_events_ownership_state_org',
      exists: true,
      validated: false,
      currentExpression: 'expected',
      expectedExpression: 'expected',
      definitionMatches: true,
      state: 'exact-unvalidated',
    },
    dispositionSettled: true,
    gateReady: false,
    plannedAction: 'validate-constraint',
    ...over,
  };
}

function evidence(
  over: {
    featureFlags?: Partial<OwnershipDispositionTableEvidence>;
    auditLogSettings?: Partial<OwnershipDispositionTableEvidence>;
    auditEvents?: Partial<OwnershipDispositionTableEvidence>;
  } = {},
): OwnershipDispositionEvidence {
  return {
    featureFlags: table('feature_flags', over.featureFlags),
    auditLogSettings: table('audit_log_settings', over.auditLogSettings),
    auditEvents: table('audit_events', over.auditEvents),
  };
}

function validated(
  name: 'feature_flags' | 'audit_log_settings' | 'audit_events',
): Partial<OwnershipDispositionTableEvidence> {
  return {
    constraint: {
      ...table(name).constraint,
      validated: true,
      state: 'exact-validated',
    },
    dispositionSettled: true,
    gateReady: true,
    plannedAction: 'no-op',
  };
}

describe('runOwnershipDispositionConvergence', () => {
  it('validates only eligible tables and leaves independently blocked tables untouched', async () => {
    const sql: string[] = [];

    const runner: SqlRunner = {
      query: async <T>(text: string) => {
        sql.push(text);

        if (text.includes('pg_try_advisory_lock')) {
          return [{ acquired: true }] as T[];
        }

        return [] as T[];
      },
    };

    const snapshots: OwnershipDispositionEvidence[] = [
      evidence({
        auditEvents: {
          counts: {
            ...table('audit_events').counts,
            total: 1,
            unresolvedLegacy: 1,
          },
          dispositionSettled: false,
          plannedAction: 'blocked-unsettled-rows',
        },
      }),
      evidence({
        featureFlags: validated('feature_flags'),
        auditEvents: {
          counts: {
            ...table('audit_events').counts,
            total: 1,
            unresolvedLegacy: 1,
          },
          dispositionSettled: false,
          plannedAction: 'blocked-unsettled-rows',
        },
      }),
      evidence({
        featureFlags: validated('feature_flags'),
        auditLogSettings: validated('audit_log_settings'),
        auditEvents: {
          counts: {
            ...table('audit_events').counts,
            total: 1,
            unresolvedLegacy: 1,
          },
          dispositionSettled: false,
          plannedAction: 'blocked-unsettled-rows',
        },
      }),
      evidence({
        featureFlags: validated('feature_flags'),
        auditLogSettings: validated('audit_log_settings'),
        auditEvents: {
          counts: {
            ...table('audit_events').counts,
            total: 1,
            unresolvedLegacy: 1,
          },
          dispositionSettled: false,
          plannedAction: 'blocked-unsettled-rows',
        },
      }),
    ];

    const result = await runOwnershipDispositionConvergence(runner, {
      gatherEvidence: async () => {
        const next = snapshots.shift();
        if (!next) throw new Error('Unexpected evidence read');
        return next;
      },
    });

    expect(result.outcomes).toEqual([
      { table: 'feature_flags', action: 'validated' },
      { table: 'audit_log_settings', action: 'validated' },
      { table: 'audit_events', action: 'blocked-unsettled-rows' },
    ]);

    expect(
      sql.filter((statement) => statement.startsWith('ALTER TABLE')),
    ).toEqual([
      'ALTER TABLE "public"."feature_flags" VALIDATE CONSTRAINT "ck_feature_flags_ownership_state_org"',
      'ALTER TABLE "public"."audit_log_settings" VALIDATE CONSTRAINT "ck_audit_log_settings_ownership_state_org"',
    ]);

    expect(
      sql.some((statement) =>
        statement.includes(
          'ALTER TABLE "public"."audit_events" VALIDATE CONSTRAINT',
        ),
      ),
    ).toBe(false);

    expect(
      sql.filter((statement) => statement.startsWith('SET lock_timeout')),
    ).toHaveLength(1);
    expect(
      sql.filter((statement) => statement.startsWith('SET statement_timeout')),
    ).toHaveLength(1);
    expect(
      sql.some((statement) => statement.includes('pg_advisory_unlock')),
    ).toBe(true);
  });

  it('performs no SET or DDL when every table is already converged', async () => {
    const sql: string[] = [];

    const runner: SqlRunner = {
      query: async <T>(text: string) => {
        sql.push(text);

        if (text.includes('pg_try_advisory_lock')) {
          return [{ acquired: true }] as T[];
        }

        return [] as T[];
      },
    };

    const ready = evidence({
      featureFlags: validated('feature_flags'),
      auditLogSettings: validated('audit_log_settings'),
      auditEvents: validated('audit_events'),
    });

    const result = await runOwnershipDispositionConvergence(runner, {
      gatherEvidence: async () => ready,
    });

    expect(result.outcomes).toEqual([
      { table: 'feature_flags', action: 'no-op' },
      { table: 'audit_log_settings', action: 'no-op' },
      { table: 'audit_events', action: 'no-op' },
    ]);

    expect(sql.some((statement) => statement.startsWith('SET '))).toBe(false);
    expect(sql.some((statement) => statement.startsWith('ALTER TABLE'))).toBe(
      false,
    );
  });

  it('fails before any schema mutation when the advisory lock is owned elsewhere', async () => {
    const sql: string[] = [];

    const runner: SqlRunner = {
      query: async <T>(text: string) => {
        sql.push(text);

        if (text.includes('pg_try_advisory_lock')) {
          return [{ acquired: false }] as T[];
        }

        return [] as T[];
      },
    };

    await expect(
      runOwnershipDispositionConvergence(runner, {
        gatherEvidence: async () => {
          throw new Error('must not inspect after lock failure');
        },
      }),
    ).rejects.toBeInstanceOf(
      OwnershipDispositionConvergenceAlreadyRunningError,
    );

    expect(sql).toHaveLength(1);
    expect(sql[0]).toContain(
      String(OWNERSHIP_DISPOSITION_ADVISORY_LOCK_KEY.id),
    );
    expect(sql.some((statement) => statement.startsWith('ALTER TABLE'))).toBe(
      false,
    );
  });

  it('fails closed when VALIDATE does not produce a gate-ready table and still releases the lock', async () => {
    const sql: string[] = [];

    const runner: SqlRunner = {
      query: async <T>(text: string) => {
        sql.push(text);

        if (text.includes('pg_try_advisory_lock')) {
          return [{ acquired: true }] as T[];
        }

        return [] as T[];
      },
    };

    const unchanged = evidence();

    await expect(
      runOwnershipDispositionConvergence(runner, {
        gatherEvidence: async () => unchanged,
      }),
    ).rejects.toThrow(/did not leave the table gate-ready/);

    expect(
      sql.some((statement) => statement.includes('pg_advisory_unlock')),
    ).toBe(true);
  });
});
