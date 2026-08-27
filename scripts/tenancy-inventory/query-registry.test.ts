import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  allStatementFingerprints,
  DATA_STATEMENTS,
  METADATA_STATEMENTS,
  QUERY_REGISTRY,
  registryFingerprint,
  REQUIRED_SELECT_TABLES,
  statementFingerprint,
  type QueryStatement,
} from './query-registry';

describe('QUERY_REGISTRY invariants', () => {
  it('has exactly 15 data statements and 1 schema-metadata statement', () => {
    expect(DATA_STATEMENTS).toHaveLength(15);
    expect(METADATA_STATEMENTS).toHaveLength(1);
    expect(QUERY_REGISTRY).toHaveLength(16);
  });

  it('has a unique id for every statement', () => {
    const ids = QUERY_REGISTRY.map((statement) => statement.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every statement non-empty SQL and at least one referenced table', () => {
    for (const statement of QUERY_REGISTRY) {
      expect(statement.sql.trim().length).toBeGreaterThan(0);
      expect(statement.tables.length).toBeGreaterThan(0);
    }
  });

  it('schema-qualifies every application relation with public., and the metadata statement with drizzle.', () => {
    // Every declared table dependency must appear in its statement's SQL
    // as a schema-qualified reference -- not a proof the SQL is *only*
    // correct because of this (query-registry.dependencies.db.test.ts
    // proves that against a real, least-privilege role), but a fast,
    // no-DB guard against a bare, unqualified table slipping back in.
    for (const statement of QUERY_REGISTRY) {
      for (const table of statement.tables) {
        const qualified = `${table.schema}.${table.table}`;
        const qualifiedQuoted = `${table.schema}."${table.table}"`;
        const referencesQualifiedTable =
          statement.sql.includes(qualified) ||
          statement.sql.includes(qualifiedQuoted);
        expect(
          referencesQualifiedTable,
          `${statement.id}: expected SQL to reference ${qualified}`,
        ).toBe(true);
      }
    }
  });

  it('is frozen at every level -- registry array, each statement, each tables array, each table object', () => {
    expect(Object.isFrozen(QUERY_REGISTRY)).toBe(true);
    for (const statement of QUERY_REGISTRY) {
      expect(Object.isFrozen(statement)).toBe(true);
      expect(Object.isFrozen(statement.tables)).toBe(true);
      for (const table of statement.tables) {
        expect(Object.isFrozen(table)).toBe(true);
      }
    }
  });

  it('rejects a mutation attempt at every frozen level (strict mode throws)', () => {
    const statement = QUERY_REGISTRY[0];
    expect(statement).toBeDefined();
    if (!statement) return;
    const table = statement.tables[0];
    expect(table).toBeDefined();
    if (!table) return;

    expect(() => {
      // @ts-expect-error -- intentionally violating readonly for the test
      QUERY_REGISTRY.push(statement);
    }).toThrow(TypeError);
    expect(() => {
      // @ts-expect-error -- intentionally violating readonly for the test
      statement.sql = 'drop table tenants';
    }).toThrow(TypeError);
    expect(() => {
      // @ts-expect-error -- intentionally violating readonly for the test
      statement.tables.push(table);
    }).toThrow(TypeError);
    expect(() => {
      // @ts-expect-error -- intentionally violating readonly for the test
      table.table = 'user_credentials';
    }).toThrow(TypeError);
  });

  it("the schema-metadata statement reads drizzle's migration table, not an application table", () => {
    expect(METADATA_STATEMENTS[0]?.id).toBe('latest_schema_migration');
    expect(METADATA_STATEMENTS[0]?.tables).toEqual([
      { schema: 'drizzle', table: '__drizzle_migrations' },
    ]);
  });
});

describe('REQUIRED_SELECT_TABLES derivation', () => {
  it("is exactly the deduplicated union of every registry statement's declared tables", () => {
    const expected = new Set<string>();
    for (const statement of QUERY_REGISTRY) {
      for (const table of statement.tables) {
        expected.add(`${table.schema}.${table.table}`);
      }
    }
    const actual = new Set(
      REQUIRED_SELECT_TABLES.map((table) => `${table.schema}.${table.table}`),
    );
    expect(actual).toEqual(expected);
  });

  it('has no duplicate entries', () => {
    const keys = REQUIRED_SELECT_TABLES.map(
      (table) => `${table.schema}.${table.table}`,
    );
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('is frozen, including every table object within it', () => {
    expect(Object.isFrozen(REQUIRED_SELECT_TABLES)).toBe(true);
    for (const table of REQUIRED_SELECT_TABLES) {
      expect(Object.isFrozen(table)).toBe(true);
    }
  });
});

describe('fingerprints', () => {
  it('gives every statement a stable, deterministic, sha256-shaped fingerprint', () => {
    const first = allStatementFingerprints();
    const second = allStatementFingerprints();
    expect(first).toEqual(second);
    expect(first).toHaveLength(16);
    for (const entry of first) {
      expect(entry.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('gives two different statements different fingerprints', () => {
    const [first, second] = QUERY_REGISTRY;
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    if (!first || !second) return;
    expect(statementFingerprint(first)).not.toBe(statementFingerprint(second));
  });

  it('is sensitive to a real change in SQL text', () => {
    const statement = QUERY_REGISTRY[0];
    expect(statement).toBeDefined();
    if (!statement) return;
    const changed = { ...statement, sql: `${statement.sql} -- changed` };
    expect(statementFingerprint(changed)).not.toBe(
      statementFingerprint(statement),
    );
  });

  it('is sensitive to a change in kind', () => {
    const statement = QUERY_REGISTRY[0];
    expect(statement).toBeDefined();
    if (!statement) return;
    const changed: QueryStatement = {
      ...statement,
      kind: statement.kind === 'data' ? 'metadata' : 'data',
    };
    expect(statementFingerprint(changed)).not.toBe(
      statementFingerprint(statement),
    );
  });

  it('is sensitive to a change in declared table dependencies', () => {
    const statement = QUERY_REGISTRY[0];
    expect(statement).toBeDefined();
    if (!statement) return;
    const changed: QueryStatement = {
      ...statement,
      tables: [...statement.tables, { schema: 'public', table: 'roles' }],
    };
    expect(statementFingerprint(changed)).not.toBe(
      statementFingerprint(statement),
    );
  });

  it('is insensitive to declared-table array order (a set, not a sequence)', () => {
    const statement = QUERY_REGISTRY.find((s) => s.tables.length > 1);
    expect(statement).toBeDefined();
    if (!statement) return;
    const reordered: QueryStatement = {
      ...statement,
      tables: [...statement.tables].reverse(),
    };
    expect(statementFingerprint(reordered)).toBe(
      statementFingerprint(statement),
    );
  });

  /**
   * No lexical whitespace normalization: the fingerprint must cover the
   * exact bytes `sql.raw(statement.sql)` executes. These two regressions
   * prove two concrete ways a normalizing fingerprint (the earlier
   * `.trim().replace(/\s+/g, ' ')` approach) could let semantically
   * different SQL collide onto the same fingerprint -- silently
   * defeating the point of binding an approved EXPLAIN artifact to what
   * actually runs later.
   */
  describe('no whitespace normalization -- collision regressions', () => {
    function asStatement(sql: string): QueryStatement {
      return {
        id: 'policies_with_null_organization_count',
        kind: 'data',
        description: 'synthetic fixture for a fingerprint regression test',
        sql,
        tables: [{ schema: 'public', table: 'policies' }],
      };
    }

    it('whitespace inside a quoted string literal is significant', () => {
      // A whitespace-collapsing normalizer would blindly flatten the two
      // spaces inside the literal down to one, making these two SQL
      // strings -- which return a different literal value when executed
      // -- hash identically.
      const twoSpaces = asStatement(`select 'a  b' as x`);
      const oneSpace = asStatement(`select 'a b' as x`);
      expect(statementFingerprint(twoSpaces)).not.toBe(
        statementFingerprint(oneSpace),
      );
    });

    it('a real newline before a line comment cannot collide with a space in the same position', () => {
      // withNewline: the `-- x` comment ends at the newline, so the next
      // line's `, 2 as y` becomes a second real select-list column --
      // this executes as `select 1, 2 as y`.
      const withNewline = asStatement('select 1 -- x\n, 2 as y');
      // collapsedToSpace: authored with a space where withNewline has a
      // newline. A whitespace-collapsing normalizer turns withNewline
      // into exactly this string, even though `-- x , 2 as y` here is
      // entirely a comment (there is no line break to end it) -- this
      // executes as just `select 1`, one column. Two different SQL
      // statements, two different executed results.
      const collapsedToSpace = asStatement('select 1 -- x , 2 as y');
      expect(statementFingerprint(withNewline)).not.toBe(
        statementFingerprint(collapsedToSpace),
      );
    });
  });

  it('gives the whole registry a deterministic fingerprint across repeated calls', () => {
    expect(registryFingerprint()).toBe(registryFingerprint());
    expect(registryFingerprint()).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is exactly sha256 of the id-sorted, colon-joined per-statement fingerprints', () => {
    const combined = [...allStatementFingerprints()]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(({ id, fingerprint }) => `${id}:${fingerprint}`)
      .join('\n');
    const expected = createHash('sha256')
      .update(combined, 'utf8')
      .digest('hex');
    expect(registryFingerprint()).toBe(expected);
  });
});
