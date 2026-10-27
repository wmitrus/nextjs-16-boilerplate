import { describe, expect, it } from 'vitest';

import {
  inspectR4aCompactIndex,
  type R4aCompactIndexSqlRunner,
} from './r4a-compact-index-inspection';

type IndexRow = Record<string, unknown>;

function index(
  table: string,
  columns: string[],
  nullsNotDistinct: boolean,
  predicate: string | null,
  valid = true,
): IndexRow {
  const keyAttributes = columns.map((column, index) => ({
    position: index + 1,
    column,
    expression: null,
    opclass:
      column === 'category'
        ? 'enum_ops'
        : column === 'organization_id'
          ? 'uuid_ops'
          : 'text_ops',
    collation:
      column === 'category' || column === 'organization_id' ? null : 'default',
  }));
  return {
    index_schema: 'public',
    table_schema: 'public',
    table_name: table,
    indisunique: true,
    amname: 'btree',
    key_attributes: keyAttributes,
    include_columns: null,
    indnullsnotdistinct: nullsNotDistinct,
    predicate,
    indisvalid: valid,
    indisready: valid,
    indislive: valid,
    definition: null,
    relkind: 'i',
    has_pg_index: true,
  };
}

const baseIndexes: Record<string, IndexRow> = {
  uq_feature_flags_key_tenant: index(
    'feature_flags',
    ['key', 'tenant_id'],
    true,
    null,
  ),
  uq_feature_flags_key_organization_canonical: index(
    'feature_flags',
    ['key', 'organization_id'],
    false,
    "organization_id IS NOT NULL AND ownership_state = 'canonical_organization'::text",
  ),
  uq_feature_flags_key_intentional_global: index(
    'feature_flags',
    ['key'],
    false,
    "ownership_state = 'intentional_global'::text",
  ),
  uq_audit_log_settings_category_tenant: index(
    'audit_log_settings',
    ['category', 'tenant_id'],
    true,
    null,
  ),
  uq_audit_log_settings_category_organization_canonical: index(
    'audit_log_settings',
    ['category', 'organization_id'],
    false,
    "organization_id IS NOT NULL AND ownership_state = 'canonical_organization'::text",
  ),
  uq_audit_log_settings_category_intentional_global: index(
    'audit_log_settings',
    ['category'],
    false,
    "ownership_state = 'intentional_global'::text",
  ),
};

function runner(
  options: {
    indexes?: Record<string, IndexRow | undefined>;
    unsettled?: Partial<Record<'feature_flags' | 'audit_log_settings', number>>;
    invalid?: Partial<Record<'feature_flags' | 'audit_log_settings', number>>;
    throwCatalog?: boolean;
    ambiguousCatalog?: boolean;
    unvalidatedCheck?: boolean;
  } = {},
): R4aCompactIndexSqlRunner {
  const indexes = new Map(
    Object.entries({ ...baseIndexes, ...options.indexes }),
  );
  return {
    async query<T>(statement: string): Promise<T[]> {
      if (options.throwCatalog && statement.includes('pg_class index_rel'))
        throw new Error('denied');
      if (statement.includes('FROM public."')) {
        const table = statement.includes('feature_flags')
          ? 'feature_flags'
          : 'audit_log_settings';
        const unsettled =
          table === 'feature_flags'
            ? options.unsettled?.feature_flags
            : options.unsettled?.audit_log_settings;
        const invalid =
          table === 'feature_flags'
            ? options.invalid?.feature_flags
            : options.invalid?.audit_log_settings;
        return [
          {
            total: '1',
            canonical_organization: '1',
            intentional_global: '0',
            unresolved_legacy: String(unsettled ?? 0),
            quarantined: '0',
            organization_owned_orphaned: '0',
            invalid_combinations: String(invalid ?? 0),
          },
        ] as T[];
      }
      if (statement.includes('FROM pg_constraint')) {
        return [
          {
            convalidated: !options.unvalidatedCheck,
            connoinherit: false,
            expression:
              "ownership_state = 'canonical_organization'::text AND organization_id IS NOT NULL OR (ownership_state = ANY (ARRAY['intentional_global'::text, 'unresolved_legacy'::text, 'quarantined'::text])) AND organization_id IS NULL",
          },
        ] as T[];
      }
      const name = [...indexes.keys()].find((candidate) =>
        statement.includes(`index_rel.relname = '${candidate}'`),
      );
      const row = name ? indexes.get(name) : undefined;
      if (!row || !name) return [];
      if (options.ambiguousCatalog) return [row as T, row as T];
      const columns = (row.key_attributes as { column: string }[]).map(
        (key) => key.column,
      );
      const definition =
        `CREATE UNIQUE INDEX ${name} ON public.${row.table_name as string} ` +
        `USING btree (${columns.join(', ')})` +
        (row.indnullsnotdistinct === true ? ' NULLS NOT DISTINCT' : '') +
        (typeof row.predicate === 'string'
          ? row.predicate.startsWith('organization_id IS NOT NULL')
            ? ` WHERE ((organization_id IS NOT NULL) AND (ownership_state = 'canonical_organization'::text))`
            : ` WHERE (${row.predicate})`
          : '');
      return [{ ...row, definition } as T];
    },
  };
}

describe('r4a-compact-index-inspection', () => {
  it('plans an eligible feature_flags index from ready per-table evidence', async () => {
    await expect(
      inspectR4aCompactIndex(runner(), 'feature_flags'),
    ).resolves.toMatchObject({
      decision: 'eligible-to-create',
      ownership: { table: 'feature_flags' },
    });
  });

  it('reports a valid exact target as already converged', async () => {
    const indexes = {
      uq_feature_flags_key_organization_compact: index(
        'feature_flags',
        ['key', 'organization_id'],
        true,
        null,
      ),
    };
    await expect(
      inspectR4aCompactIndex(runner({ indexes }), 'feature_flags'),
    ).resolves.toMatchObject({ decision: 'already-converged' });
  });

  it('requires recovery for an exact but invalid target', async () => {
    const indexes = {
      uq_feature_flags_key_organization_compact: index(
        'feature_flags',
        ['key', 'organization_id'],
        true,
        null,
        false,
      ),
    };
    await expect(
      inspectR4aCompactIndex(runner({ indexes }), 'feature_flags'),
    ).resolves.toMatchObject({ decision: 'invalid-index-recovery-required' });
  });

  it.each([
    ['wrong index schema', { index_schema: 'shadow' }],
    ['wrong table schema', { table_schema: 'shadow' }],
    ['wrong table', { table_name: 'audit_log_settings' }],
    [
      'wrong definition',
      {
        key_attributes: index(
          'feature_flags',
          ['organization_id', 'key'],
          true,
          null,
        ).key_attributes,
      },
    ],
    ['INCLUDE column', { include_columns: ['tenant_id'] }],
    [
      'wrong opclass',
      {
        key_attributes: [
          {
            position: 1,
            column: 'key',
            expression: null,
            opclass: 'varchar_ops',
            collation: 'default',
          },
          {
            position: 2,
            column: 'organization_id',
            expression: null,
            opclass: 'uuid_ops',
            collation: null,
          },
        ],
      },
    ],
    [
      'wrong collation',
      {
        key_attributes: [
          {
            position: 1,
            column: 'key',
            expression: null,
            opclass: 'text_ops',
            collation: 'C',
          },
          {
            position: 2,
            column: 'organization_id',
            expression: null,
            opclass: 'uuid_ops',
            collation: null,
          },
        ],
      },
    ],
    [
      'expression key',
      {
        key_attributes: [
          {
            position: 1,
            column: null,
            expression: 'lower(key)',
            opclass: 'text_ops',
            collation: 'default',
          },
          {
            position: 2,
            column: 'organization_id',
            expression: null,
            opclass: 'uuid_ops',
            collation: null,
          },
        ],
      },
    ],
  ])(
    'fails closed on a compact index with the %s',
    async (_label, override) => {
      const indexes = {
        uq_feature_flags_key_organization_compact: {
          ...index('feature_flags', ['key', 'organization_id'], true, null),
          ...override,
        },
      };
      await expect(
        inspectR4aCompactIndex(runner({ indexes }), 'feature_flags'),
      ).resolves.toMatchObject({ decision: 'blocked-by-schema-drift' });
    },
  );

  it('fails closed on an ambiguous same-name catalog result', async () => {
    await expect(
      inspectR4aCompactIndex(
        runner({ ambiguousCatalog: true }),
        'feature_flags',
      ),
    ).resolves.toMatchObject({
      catalogAvailable: false,
      decision: 'blocked-by-schema-drift',
    });
  });

  it('blocks a relation-name collision with a non-index object', async () => {
    const indexes = {
      uq_feature_flags_key_organization_compact: {
        ...index('feature_flags', ['key', 'organization_id'], true, null),
        relkind: 'r',
        has_pg_index: false,
      },
    };
    await expect(
      inspectR4aCompactIndex(runner({ indexes }), 'feature_flags'),
    ).resolves.toMatchObject({ decision: 'blocked-by-schema-drift' });
  });

  it('requires recovery when an exact index is not ready', async () => {
    const indexes = {
      uq_feature_flags_key_organization_compact: {
        ...index('feature_flags', ['key', 'organization_id'], true, null),
        indisready: false,
      },
    };
    await expect(
      inspectR4aCompactIndex(runner({ indexes }), 'feature_flags'),
    ).resolves.toMatchObject({ decision: 'invalid-index-recovery-required' });
  });

  describe('ownership gate precedes INVALID recovery', () => {
    const invalidTarget = (override: IndexRow = {}) => ({
      uq_feature_flags_key_organization_compact: {
        ...index('feature_flags', ['key', 'organization_id'], true, null),
        indisvalid: false,
        indisready: false,
        indislive: true,
        ...override,
      },
    });

    it.each([
      ['unresolved rows', { unsettled: { feature_flags: 1 } }],
      ['invalid ownership combinations', { invalid: { feature_flags: 1 } }],
      ['an unvalidated ownership CHECK', { unvalidatedCheck: true }],
    ])(
      'blocks an exact INVALID/not-ready/live target with %s',
      async (_label, gate) => {
        await expect(
          inspectR4aCompactIndex(
            runner({ indexes: invalidTarget(), ...gate }),
            'feature_flags',
          ),
        ).resolves.toMatchObject({
          decision: 'blocked-by-disposition',
          reasons: ['table-specific-ownership-disposition-not-ready'],
        });
      },
    );

    it('blocks an exact valid-but-not-ready target with an unsettled table', async () => {
      await expect(
        inspectR4aCompactIndex(
          runner({
            indexes: invalidTarget({ indisvalid: true }),
            unsettled: { feature_flags: 1 },
          }),
          'feature_flags',
        ),
      ).resolves.toMatchObject({ decision: 'blocked-by-disposition' });
    });

    it('still reports schema drift ahead of an unready gate', async () => {
      await expect(
        inspectR4aCompactIndex(
          runner({
            indexes: invalidTarget({ table_schema: 'shadow' }),
            unsettled: { feature_flags: 1 },
          }),
          'feature_flags',
        ),
      ).resolves.toMatchObject({
        decision: 'blocked-by-schema-drift',
        reasons: ['compact-index-wrong-identity-or-definition'],
      });
    });

    it('still reports a broken retained index ahead of an unready gate', async () => {
      await expect(
        inspectR4aCompactIndex(
          runner({
            indexes: {
              ...invalidTarget(),
              uq_feature_flags_key_tenant: undefined,
            },
            unvalidatedCheck: true,
          }),
          'feature_flags',
        ),
      ).resolves.toMatchObject({
        decision: 'blocked-by-schema-drift',
        reasons: ['legacy-or-semantic-index-not-intact'],
      });
    });

    it('reports recovery only once the gate is ready', async () => {
      await expect(
        inspectR4aCompactIndex(
          runner({ indexes: invalidTarget() }),
          'feature_flags',
        ),
      ).resolves.toMatchObject({
        decision: 'invalid-index-recovery-required',
        reasons: ['exact-identity-index-not-valid-ready-and-live'],
      });
    });
  });

  it('blocks only the independently unsettled audit settings table', async () => {
    await expect(
      inspectR4aCompactIndex(
        runner({ unsettled: { audit_log_settings: 1 } }),
        'audit_log_settings',
      ),
    ).resolves.toMatchObject({ decision: 'blocked-by-disposition' });
  });

  it('does not query audit_events for an R4a table', async () => {
    const queries: string[] = [];
    const base = runner();
    const observed: R4aCompactIndexSqlRunner = {
      query: async <T>(statement: string) => {
        queries.push(statement);
        return base.query<T>(statement);
      },
    };
    await expect(
      inspectR4aCompactIndex(observed, 'feature_flags'),
    ).resolves.toMatchObject({ decision: 'eligible-to-create' });
    expect(queries.join('\n')).not.toContain('audit_events');
  });

  it('fails closed when catalog evidence is unavailable', async () => {
    await expect(
      inspectR4aCompactIndex(runner({ throwCatalog: true }), 'feature_flags'),
    ).resolves.toMatchObject({
      catalogAvailable: false,
      decision: 'blocked-by-schema-drift',
      reasons: ['catalog-or-ownership-evidence-unavailable'],
    });
  });
});
