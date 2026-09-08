import { describe, expect, it } from 'vitest';

import {
  appendMigrationSessionParams,
  AUD_A_DEFERRED_FK_VALIDATIONS,
  AUD_A_DEFERRED_INDEXES,
  AUD_A_TIMEOUTS,
  AUDIT_EVENTS_ORGANIZATION_INDEX,
  AudAConvergenceError,
  DeferredIndexDefinitionMismatchError,
  decideDeferredIndexAction,
  ensureDeferredIndexes,
  normalizeIndexdef,
  validateDeferredForeignKeys,
  type ExistingIndexState,
  type SqlRunner,
} from './post-migrate-steps';

/**
 * OZI-71 AUD·A — pure/decision + timeout-policy + enforcement contracts for the
 * post-migrate convergence steps. Real-DB executor behaviour lives in
 * `post-migrate-steps.db.test.ts`.
 */

const SPEC = AUDIT_EVENTS_ORGANIZATION_INDEX;
const NONE: ExistingIndexState = {
  exists: false,
  valid: false,
  indexdef: null,
};
const VALID_MATCH: ExistingIndexState = {
  exists: true,
  valid: true,
  indexdef: SPEC.expectedIndexdef,
};

describe('normalizeIndexdef', () => {
  it('lower-cases, collapses whitespace and drops a trailing semicolon', () => {
    expect(
      normalizeIndexdef(
        '  CREATE   INDEX  idx ON public.t USING btree (a, b) ;\n',
      ),
    ).toBe('create index idx on t using btree (a, b)');
  });

  it('treats the real-Postgres (public.) and PGlite (bare) forms as equal', () => {
    expect(
      normalizeIndexdef(
        'CREATE INDEX idx_x ON public.audit_events USING btree (organization_id, occurred_at)',
      ),
    ).toBe(
      normalizeIndexdef(
        'CREATE INDEX idx_x ON audit_events USING btree (organization_id, occurred_at)',
      ),
    );
  });
});

describe('decideDeferredIndexAction', () => {
  it('defers when a required column is not present yet (pre-0023 database)', () => {
    expect(decideDeferredIndexAction(SPEC, false, NONE)).toEqual({
      kind: 'deferred',
      reason: expect.stringContaining('organization_id'),
    });
  });

  it('creates when the index is missing', () => {
    expect(decideDeferredIndexAction(SPEC, true, NONE)).toEqual({
      kind: 'create',
    });
  });

  it('rebuilds an INVALID index (a previously interrupted CONCURRENTLY build)', () => {
    expect(
      decideDeferredIndexAction(SPEC, true, {
        exists: true,
        valid: false,
        indexdef: SPEC.expectedIndexdef,
      }),
    ).toEqual({ kind: 'recreate-invalid' });
  });

  it('is a no-op for a matching valid index (idempotent)', () => {
    expect(decideDeferredIndexAction(SPEC, true, VALID_MATCH)).toEqual({
      kind: 'skip',
    });
  });

  it('accepts a valid index whose definition differs only in formatting', () => {
    expect(
      decideDeferredIndexAction(SPEC, true, {
        exists: true,
        valid: true,
        indexdef:
          'CREATE INDEX idx_audit_events_organization_occurred ON public.audit_events USING btree (organization_id,   occurred_at)',
      }),
    ).toEqual({ kind: 'skip' });
  });

  it('FAILS CLOSED: throws on a same-name VALID index with a different column order', () => {
    expect(() =>
      decideDeferredIndexAction(SPEC, true, {
        exists: true,
        valid: true,
        indexdef:
          'CREATE INDEX idx_audit_events_organization_occurred ON public.audit_events USING btree (occurred_at, organization_id)',
      }),
    ).toThrow(DeferredIndexDefinitionMismatchError);
  });

  it('FAILS CLOSED: throws on a same-name VALID UNIQUE index where a plain one is expected', () => {
    expect(() =>
      decideDeferredIndexAction(SPEC, true, {
        exists: true,
        valid: true,
        indexdef:
          'CREATE UNIQUE INDEX idx_audit_events_organization_occurred ON public.audit_events USING btree (organization_id, occurred_at)',
      }),
    ).toThrow(/unexpected definition/);
  });
});

/**
 * A configurable fake `SqlRunner` that answers the three introspection queries
 * from canned state and records every other statement it is asked to run.
 */
interface FakeState {
  columnsPresent?: boolean;
  index?: ExistingIndexState;
  fkConvalidated?: Record<string, boolean | null>;
}

function fakeRunner(state: FakeState = {}): {
  runner: SqlRunner;
  statements: string[];
} {
  const statements: string[] = [];
  let index: ExistingIndexState = state.index ?? NONE;
  const runner: SqlRunner = {
    query: async <T>(text: string) => {
      if (
        text.startsWith('select column_name from information_schema.columns')
      ) {
        const present = state.columnsPresent ?? true;
        return (present ? [{}, {}] : []) as T[];
      }
      if (text.startsWith('select i.indisvalid')) {
        return (
          index.exists
            ? [{ indisvalid: index.valid, indexdef: index.indexdef }]
            : []
        ) as T[];
      }
      const fkMatch = /conname = '([a-z_]+)'/.exec(text);
      if (text.startsWith('select convalidated') && fkMatch) {
        const v = state.fkConvalidated?.[fkMatch[1]!];
        return (
          v === undefined || v === null ? [] : [{ convalidated: v }]
        ) as T[];
      }
      // A recorded (mutating) statement — model its effect on fake state.
      statements.push(text);
      if (/^CREATE INDEX/.test(text)) index = VALID_MATCH;
      if (/^DROP INDEX/.test(text)) index = NONE;
      const v = /VALIDATE CONSTRAINT "([a-z_]+)"/.exec(text);
      if (v && state.fkConvalidated) state.fkConvalidated[v[1]!] = true;
      return [] as T[];
    },
  };
  return { runner, statements };
}

describe('timeout policy is applied (not merely documented)', () => {
  it('appendMigrationSessionParams sets lock_timeout=3000 & statement_timeout=30000, idempotently, preserving other params', () => {
    const out = appendMigrationSessionParams(
      'postgresql://u:p@ep-x.example/db?sslmode=require',
    );
    const u = new URL(out);
    expect(u.searchParams.get('lock_timeout')).toBe('3000');
    expect(u.searchParams.get('statement_timeout')).toBe('30000');
    expect(u.searchParams.get('sslmode')).toBe('require');
    // idempotent
    expect(appendMigrationSessionParams(out)).toBe(out);
  });

  it('documented values', () => {
    expect(AUD_A_TIMEOUTS).toEqual({
      LOCK_TIMEOUT_MS: 3_000,
      STATEMENT_TIMEOUT_DDL_MS: 30_000,
      STATEMENT_TIMEOUT_INDEX_MS: 0,
      STATEMENT_TIMEOUT_VALIDATE_MS: 3_600_000,
    });
  });

  it('ensureDeferredIndexes (enforce, concurrent) SETs lock_timeout=3000 & statement_timeout=0 before CREATE INDEX CONCURRENTLY', async () => {
    const { runner, statements } = fakeRunner({
      columnsPresent: true,
      index: NONE,
    });

    await ensureDeferredIndexes(runner, 'concurrent', undefined, {
      enforcement: 'enforce',
    });

    expect(statements[0]).toBe('SET lock_timeout = 3000');
    expect(statements[1]).toBe('SET statement_timeout = 0');
    expect(statements[2]).toContain('CREATE INDEX CONCURRENTLY');
    // Never impose a short statement_timeout on the index build.
    expect(statements).not.toContain('SET statement_timeout = 30000');
  });

  it('validateDeferredForeignKeys (enforce) SETs lock_timeout=3000 & statement_timeout=3600000 before VALIDATE CONSTRAINT', async () => {
    const { runner, statements } = fakeRunner({
      fkConvalidated: {
        audit_events_organization_id_organizations_id_fk: false,
        audit_log_settings_organization_id_organizations_id_fk: false,
      },
    });

    await validateDeferredForeignKeys(runner, undefined, {
      enforcement: 'enforce',
    });

    expect(statements).toEqual([
      'SET lock_timeout = 3000',
      'SET statement_timeout = 3600000',
      'ALTER TABLE "audit_events" VALIDATE CONSTRAINT "audit_events_organization_id_organizations_id_fk"',
      'ALTER TABLE "audit_log_settings" VALIDATE CONSTRAINT "audit_log_settings_organization_id_organizations_id_fk"',
    ]);
  });
});

describe('convergence enforcement contract', () => {
  it('inspect mode: absent columns -> report deferred, no mutation', async () => {
    const { runner, statements } = fakeRunner({ columnsPresent: false });
    const outcomes = await ensureDeferredIndexes(
      runner,
      'concurrent',
      undefined,
      {
        enforcement: 'inspect',
      },
    );
    expect(outcomes).toEqual([
      { name: SPEC.name, action: 'deferred', detail: expect.any(String) },
    ]);
    expect(statements).toEqual([]);
  });

  it('enforce mode: absent columns -> AudAConvergenceError', async () => {
    const { runner } = fakeRunner({ columnsPresent: false });
    await expect(
      ensureDeferredIndexes(runner, 'concurrent', undefined, {
        enforcement: 'enforce',
      }),
    ).rejects.toBeInstanceOf(AudAConvergenceError);
  });

  it('inspect mode: absent FK -> report missing, no mutation', async () => {
    const { runner, statements } = fakeRunner({ fkConvalidated: {} });
    const outcomes = await validateDeferredForeignKeys(runner, undefined, {
      enforcement: 'inspect',
    });
    expect(outcomes.every((o) => o.action === 'missing')).toBe(true);
    expect(statements).toEqual([]);
  });

  it('enforce mode: absent FK -> AudAConvergenceError', async () => {
    const { runner } = fakeRunner({ fkConvalidated: {} });
    await expect(
      validateDeferredForeignKeys(runner, undefined, {
        enforcement: 'enforce',
      }),
    ).rejects.toBeInstanceOf(AudAConvergenceError);
  });

  it('inspect mode: NOT VALID FK -> report validate (would), no ALTER issued', async () => {
    const { runner, statements } = fakeRunner({
      fkConvalidated: {
        audit_events_organization_id_organizations_id_fk: false,
        audit_log_settings_organization_id_organizations_id_fk: false,
      },
    });
    const outcomes = await validateDeferredForeignKeys(runner, undefined, {
      enforcement: 'inspect',
    });
    expect(outcomes.map((o) => o.action)).toEqual(['validate', 'validate']);
    expect(statements).toEqual([]);
  });

  it('enforce mode: an already-valid index and validated FKs are an idempotent skip', async () => {
    const { runner, statements } = fakeRunner({
      columnsPresent: true,
      index: VALID_MATCH,
      fkConvalidated: {
        audit_events_organization_id_organizations_id_fk: true,
        audit_log_settings_organization_id_organizations_id_fk: true,
      },
    });
    const ix = await ensureDeferredIndexes(runner, 'concurrent', undefined, {
      enforcement: 'enforce',
    });
    const fk = await validateDeferredForeignKeys(runner, undefined, {
      enforcement: 'enforce',
    });
    expect(ix).toEqual([{ name: SPEC.name, action: 'skip' }]);
    expect(fk.map((o) => o.action)).toEqual(['skip', 'skip']);
    expect(statements).toEqual([]); // nothing mutated, no timeouts SET
  });
});

describe('AUD·A deferred-step registries', () => {
  it('lists exactly the audit_events organization index', () => {
    expect(AUD_A_DEFERRED_INDEXES).toEqual([AUDIT_EVENTS_ORGANIZATION_INDEX]);
    expect(SPEC.columnListSql).toBe('("organization_id","occurred_at")');
  });

  it('lists both organization FKs, events first (SET NULL) then settings (CASCADE)', () => {
    expect(AUD_A_DEFERRED_FK_VALIDATIONS.map((f) => f.table)).toEqual([
      'audit_events',
      'audit_log_settings',
    ]);
    expect(AUD_A_DEFERRED_FK_VALIDATIONS.map((f) => f.constraint)).toEqual([
      'audit_events_organization_id_organizations_id_fk',
      'audit_log_settings_organization_id_organizations_id_fk',
    ]);
  });
});
