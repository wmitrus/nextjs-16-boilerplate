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

  it('is frozen at every level -- the array, each statement, each tables array', () => {
    expect(Object.isFrozen(QUERY_REGISTRY)).toBe(true);
    for (const statement of QUERY_REGISTRY) {
      expect(Object.isFrozen(statement)).toBe(true);
      expect(Object.isFrozen(statement.tables)).toBe(true);
    }
  });

  it("the schema-metadata statement reads drizzle's migration table, not an application table", () => {
    expect(METADATA_STATEMENTS[0]?.id).toBe('latest_schema_migration');
    expect(METADATA_STATEMENTS[0]?.tables).toEqual([
      { schema: 'drizzle', table: '__drizzle_migrations' },
    ]);
  });
});

describe('REQUIRED_SELECT_TABLES derivation', () => {
  it("is exactly the deduplicated union of every registry statement's tables", () => {
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

  it('is frozen', () => {
    expect(Object.isFrozen(REQUIRED_SELECT_TABLES)).toBe(true);
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

  it('is insensitive to whitespace-only differences in SQL text', () => {
    const statement = QUERY_REGISTRY[0];
    expect(statement).toBeDefined();
    if (!statement) return;
    const reformatted = {
      ...statement,
      sql: `  ${statement.sql.split('\n').join('\n   ')}  `,
    };
    expect(statementFingerprint(reformatted)).toBe(
      statementFingerprint(statement),
    );
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
