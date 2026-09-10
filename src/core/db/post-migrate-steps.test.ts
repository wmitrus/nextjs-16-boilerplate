import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  assertDirectPostgresUrl,
  AUD_A_DEFERRED_FK_VALIDATIONS,
  AUD_A_DEFERRED_INDEXES,
  AUD_A_TIMEOUTS,
  AUDIT_EVENTS_ORGANIZATION_INDEX,
  AudAConvergenceError,
  classifyIndexInspection,
  DeferredForeignKeyDefinitionMismatchError,
  DeferredIndexDefinitionMismatchError,
  decideDeferredForeignKeyAction,
  decideDeferredIndexAction,
  ensureDeferredIndexes,
  formatExpectedForeignKeyDef,
  isPooledPostgresUrl,
  normalizeIndexdef,
  PooledConnectionRejectedError,
  validateDeferredForeignKeys,
  type ExistingIndexState,
  type ForeignKeyIntrospection,
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

  // Codex P2: an INVALID same-name index must be STRUCTURALLY verified before
  // it is treated as a rebuildable interrupted build — never inferred from
  // `indisvalid = false` alone.
  it('INVALID + EXACT expected definition -> recreate-invalid', () => {
    expect(
      decideDeferredIndexAction(SPEC, true, {
        exists: true,
        valid: false,
        indexdef:
          'CREATE INDEX idx_audit_events_organization_occurred ON public.audit_events USING btree (organization_id,  occurred_at)',
      }),
    ).toEqual({ kind: 'recreate-invalid' });
  });

  it('FAILS CLOSED: INVALID same-name index with WRONG columns -> DeferredIndexDefinitionMismatchError', () => {
    expect(() =>
      decideDeferredIndexAction(SPEC, true, {
        exists: true,
        valid: false,
        indexdef:
          'CREATE INDEX idx_audit_events_organization_occurred ON public.audit_events USING btree (occurred_at, organization_id)',
      }),
    ).toThrow(DeferredIndexDefinitionMismatchError);
  });

  it('FAILS CLOSED: INVALID same-name UNIQUE index where a plain one is expected -> mismatch error', () => {
    expect(() =>
      decideDeferredIndexAction(SPEC, true, {
        exists: true,
        valid: false,
        indexdef:
          'CREATE UNIQUE INDEX idx_audit_events_organization_occurred ON public.audit_events USING btree (organization_id, occurred_at)',
      }),
    ).toThrow(/unexpected definition/);
  });

  it('FAILS CLOSED: an existing index with no readable definition never matches', () => {
    expect(() =>
      decideDeferredIndexAction(SPEC, true, {
        exists: true,
        valid: false,
        indexdef: null,
      }),
    ).toThrow(DeferredIndexDefinitionMismatchError);
  });
});

describe('classifyIndexInspection (read-only inspector agrees with enforce)', () => {
  const wrongDef =
    'CREATE INDEX idx_audit_events_organization_occurred ON public.audit_events USING btree (occurred_at)';

  it('absent -> create-concurrently / blocked per columns', () => {
    expect(classifyIndexInspection(SPEC, NONE, true)).toEqual({
      state: 'absent',
      plannedAction: 'create-concurrently',
    });
    expect(classifyIndexInspection(SPEC, NONE, false)).toEqual({
      state: 'absent',
      plannedAction: 'blocked-expand-not-applied',
    });
  });

  it('valid + exact -> valid-exact / no-op', () => {
    expect(classifyIndexInspection(SPEC, VALID_MATCH, true)).toEqual({
      state: 'valid-exact',
      plannedAction: 'no-op',
    });
  });

  it('INVALID + exact -> invalid / rebuild-invalid', () => {
    expect(
      classifyIndexInspection(
        SPEC,
        { exists: true, valid: false, indexdef: SPEC.expectedIndexdef },
        true,
      ),
    ).toEqual({ state: 'invalid', plannedAction: 'rebuild-invalid' });
  });

  it('VALID + wrong definition -> valid-wrong-definition / abort-wrong-definition', () => {
    expect(
      classifyIndexInspection(
        SPEC,
        { exists: true, valid: true, indexdef: wrongDef },
        true,
      ),
    ).toEqual({
      state: 'valid-wrong-definition',
      plannedAction: 'abort-wrong-definition',
    });
  });

  it('INVALID + wrong definition -> invalid-wrong-definition / abort-wrong-definition (NOT rebuild, NOT valid-*)', () => {
    expect(
      classifyIndexInspection(
        SPEC,
        { exists: true, valid: false, indexdef: wrongDef },
        true,
      ),
    ).toEqual({
      state: 'invalid-wrong-definition',
      plannedAction: 'abort-wrong-definition',
    });
  });
});

const FK_ACTION_CODE = new Map<string, string>([
  ['no action', 'a'],
  ['restrict', 'r'],
  ['cascade', 'c'],
  ['set null', 'n'],
  ['set default', 'd'],
]);

/**
 * A configurable fake `SqlRunner` that answers the introspection queries from
 * canned state and records every other statement it is asked to run.
 *
 * `fkConvalidated[name]`: `undefined` / `null` → the FK is ABSENT on its
 * expected table; `true` / `false` → present with the EXACT structural
 * definition and that `convalidated`. `fkWrongDef[name]` forces a
 * wrong-definition row (differing ON DELETE).
 */
interface FakeState {
  columnsPresent?: boolean;
  index?: ExistingIndexState;
  fkConvalidated?: Record<string, boolean | null>;
  fkWrongDef?: Record<string, boolean>;
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
      // The structural FK introspection query.
      const fkMatch = /c\.conname = '([a-z_]+)'/.exec(text);
      if (text.startsWith('with target as (') && fkMatch) {
        const name = fkMatch[1]!;
        const conv = new Map(Object.entries(state.fkConvalidated ?? {})).get(
          name,
        );
        if (conv === undefined || conv === null) return [] as T[]; // absent
        const spec = AUD_A_DEFERRED_FK_VALIDATIONS.find(
          (f) => f.constraint === name,
        )!;
        const exactDel = FK_ACTION_CODE.get(spec.onDelete)!;
        const wrong =
          new Map(Object.entries(state.fkWrongDef ?? {})).get(name) === true;
        return [
          {
            contype: 'f',
            source_schema: spec.schema,
            source_table: spec.table,
            referenced_schema: spec.referencedSchema,
            referenced_table: spec.referencedTable,
            confdeltype: wrong ? (exactDel === 'c' ? 'n' : 'c') : exactDel,
            confupdtype: FK_ACTION_CODE.get(spec.onUpdate)!,
            confmatchtype: 's',
            condeferrable: false,
            condeferred: false,
            convalidated: conv,
            definition:
              'FOREIGN KEY (' +
              spec.columns.join(', ') +
              ') REFERENCES ' +
              spec.referencedSchema +
              '.' +
              spec.referencedTable +
              '(' +
              spec.referencedColumns.join(', ') +
              ')' +
              (conv ? '' : ' NOT VALID'),
            local_columns: spec.columns.join(','),
            referenced_columns: spec.referencedColumns.join(','),
          },
        ] as T[];
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
      'ALTER TABLE "public"."audit_events" VALIDATE CONSTRAINT "audit_events_organization_id_organizations_id_fk"',
      'ALTER TABLE "public"."audit_log_settings" VALIDATE CONSTRAINT "audit_log_settings_organization_id_organizations_id_fk"',
    ]);
  });
});

describe('AUD·A 0023-only timeout scoping (fix 1)', () => {
  const MIGRATIONS_DIR = resolve(
    process.cwd(),
    'src/core/db/migrations/generated',
  );
  const read = (f: string) =>
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    readFileSync(resolve(MIGRATIONS_DIR, f), 'utf8');

  it('migration 0023 wraps its statements in SET LOCAL lock_timeout=3s / statement_timeout=30s and resets to DEFAULT', () => {
    const sql = read('0023_breezy_sandman.sql');
    const stmts = sql
      .split('\n')
      .filter((l) => !/^\s*--/.test(l))
      .join('\n')
      .split(/;\s*(?:--> statement-breakpoint)?/)
      .map((s) => s.trim())
      .filter(Boolean);

    expect(stmts[0]).toBe("SET LOCAL lock_timeout = '3s'");
    expect(stmts[1]).toBe("SET LOCAL statement_timeout = '30s'");
    expect(stmts.at(-2)).toBe('SET LOCAL lock_timeout = DEFAULT');
    expect(stmts.at(-1)).toBe('SET LOCAL statement_timeout = DEFAULT');
    // Every DDL statement sits BETWEEN the SET LOCAL and the reset.
    const firstDdl = stmts.findIndex((s) => /^ALTER TABLE|^CREATE /i.test(s));
    const resetAt = stmts.findIndex((s) => /= DEFAULT$/.test(s));
    expect(firstDdl).toBeGreaterThan(1);
    expect(firstDdl).toBeLessThan(resetAt);
  });

  it('NO OTHER generated migration sets lock_timeout / statement_timeout (0023-only)', () => {
    const offenders = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql') && f !== '0023_breezy_sandman.sql')
      .filter((f) => /\b(lock_timeout|statement_timeout)\b/i.test(read(f)));
    expect(offenders).toEqual([]);
  });
});

describe('direct/unpooled connection guard (fix 2)', () => {
  it('accepts a direct URL (generic and Neon direct)', () => {
    expect(
      isPooledPostgresUrl('postgresql://u:p@db.internal.example/app'),
    ).toBe(false);
    expect(
      isPooledPostgresUrl(
        'postgresql://u:p@ep-cool-name-123.us-east-1.aws.neon.tech/app',
      ),
    ).toBe(false);
    expect(() =>
      assertDirectPostgresUrl(
        'postgresql://u:p@ep-cool-name-123.us-east-1.aws.neon.tech/app',
        'test',
      ),
    ).not.toThrow();
  });

  it('rejects known pooler URLs (Neon pooler, Supabase pooler, pgbouncer)', () => {
    for (const url of [
      'postgresql://u:p@ep-cool-name-123-pooler.us-east-1.aws.neon.tech/app',
      'postgresql://u:p@aws-0-eu-west-1.pooler.supabase.com:6543/postgres',
      'postgresql://u:p@db.example/app?pgbouncer=true',
      'postgresql://u:p@pgbouncer.internal:6432/app',
    ]) {
      expect(isPooledPostgresUrl(url), url).toBe(true);
      expect(() => assertDirectPostgresUrl(url, 'test'), url).toThrow(
        PooledConnectionRejectedError,
      );
    }
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

describe('structural FK identity (Codex P2)', () => {
  const exact = (
    over: Partial<ForeignKeyIntrospection> = {},
  ): ForeignKeyIntrospection => ({
    exists: true,
    matchesSpec: true,
    convalidated: false,
    definition:
      'FOREIGN KEY (organization_id) REFERENCES public.organizations(id)',
    mismatches: [],
    ...over,
  });

  it('decideDeferredForeignKeyAction maps every introspection state', () => {
    const spec = AUD_A_DEFERRED_FK_VALIDATIONS[0]!;
    expect(
      decideDeferredForeignKeyAction(spec, {
        exists: false,
        matchesSpec: false,
        convalidated: false,
        definition: null,
        mismatches: ['absent'],
      }).kind,
    ).toBe('blocked-missing');
    expect(
      decideDeferredForeignKeyAction(spec, {
        exists: true,
        matchesSpec: false,
        convalidated: true, // validated but WRONG definition is still wrong
        definition: 'x',
        mismatches: ["ON DELETE: expected 'set null', got 'cascade'"],
      }).kind,
    ).toBe('abort-wrong-definition');
    expect(decideDeferredForeignKeyAction(spec, exact()).kind).toBe('validate');
    expect(
      decideDeferredForeignKeyAction(spec, exact({ convalidated: true })).kind,
    ).toBe('skip');
  });

  it('formatExpectedForeignKeyDef renders both canonical AUD·A FKs', () => {
    expect(formatExpectedForeignKeyDef(AUD_A_DEFERRED_FK_VALIDATIONS[0]!)).toBe(
      'FOREIGN KEY (organization_id) REFERENCES public.organizations (id) ON DELETE SET NULL ON UPDATE NO ACTION',
    );
    expect(formatExpectedForeignKeyDef(AUD_A_DEFERRED_FK_VALIDATIONS[1]!)).toBe(
      'FOREIGN KEY (organization_id) REFERENCES public.organizations (id) ON DELETE CASCADE ON UPDATE NO ACTION',
    );
  });

  it('enforce mode: a same-name wrong-definition FK HARD FAILS before VALIDATE and is never mutated', async () => {
    const { runner, statements } = fakeRunner({
      fkConvalidated: {
        audit_events_organization_id_organizations_id_fk: false,
        audit_log_settings_organization_id_organizations_id_fk: false,
      },
      fkWrongDef: { audit_events_organization_id_organizations_id_fk: true },
    });
    await expect(
      validateDeferredForeignKeys(runner, undefined, {
        enforcement: 'enforce',
      }),
    ).rejects.toBeInstanceOf(DeferredForeignKeyDefinitionMismatchError);
    // No VALIDATE / SET issued — the drift is reported, never touched.
    expect(statements).toEqual([]);
  });

  it('inspect mode: a same-name wrong-definition FK is REPORTED, not thrown', async () => {
    const { runner, statements } = fakeRunner({
      fkConvalidated: {
        audit_events_organization_id_organizations_id_fk: true,
        audit_log_settings_organization_id_organizations_id_fk: true,
      },
      fkWrongDef: { audit_events_organization_id_organizations_id_fk: true },
    });
    const out = await validateDeferredForeignKeys(runner, undefined, {
      enforcement: 'inspect',
    });
    expect(out.map((o) => o.action)).toEqual(['wrong-definition', 'skip']);
    expect(statements).toEqual([]);
  });

  it('enforce mode: VALIDATE is issued on the schema-qualified expected table', async () => {
    const { runner, statements } = fakeRunner({
      fkConvalidated: {
        audit_events_organization_id_organizations_id_fk: false,
        audit_log_settings_organization_id_organizations_id_fk: true,
      },
    });
    const out = await validateDeferredForeignKeys(runner, undefined, {
      enforcement: 'enforce',
    });
    expect(out.map((o) => o.action)).toEqual(['validate', 'skip']);
    expect(statements).toContain(
      'ALTER TABLE "public"."audit_events" VALIDATE CONSTRAINT "audit_events_organization_id_organizations_id_fk"',
    );
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
