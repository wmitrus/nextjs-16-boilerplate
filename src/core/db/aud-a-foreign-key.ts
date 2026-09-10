/**
 * OZI-71 AUD·A — pure foreign-key structural-identity logic (Codex P2).
 *
 * Extracted from `post-migrate-steps.ts` so the convergence executor there
 * stays focused on orchestration + I/O. This module has NO database
 * dependency: it builds the introspection SQL string, interprets one raw
 * `pg_constraint` row against the canonical spec, and decides the convergence
 * action. `post-migrate-steps.ts` re-exports everything the tests / CLI
 * import, so existing import paths are unchanged.
 *
 * Identity rule: a constraint name is unique only WITHIN its table, so an
 * AUD·A deferred FK is "present/correct" only when its COMPLETE structural
 * definition matches — source schema+table, `contype = 'f'`, ordered local &
 * referenced column lists, referenced schema+table, ON DELETE / ON UPDATE,
 * MATCH, and deferrability. `convalidated` is rollout STATE, kept separate and
 * NEVER part of identity.
 */

/** Referential action, as written in SQL and decoded from `pg_constraint`. */
export type ForeignKeyReferentialAction =
  | 'no action'
  | 'restrict'
  | 'cascade'
  | 'set null'
  | 'set default';

/** FK match semantics; AUD·A uses the default (simple). */
export type ForeignKeyMatchType = 'simple' | 'full' | 'partial';

/**
 * Complete structural identity of a deferred AUD·A foreign key. Every field is
 * compared structurally against `pg_constraint` (+ `pg_class` / `pg_namespace`
 * / `pg_attribute`), anchored to the EXPECTED `schema.table`.
 */
export interface DeferredForeignKeyValidation {
  /** Source (child) schema — always `public` for AUD·A. */
  readonly schema: string;
  /** Source (child) table (unqualified, within `schema`). */
  readonly table: string;
  /** Constraint name (unique within `schema.table` only). */
  readonly constraint: string;
  /** Ordered local (child) column list, exactly as in the FK. */
  readonly columns: readonly string[];
  /** Referenced (parent) schema — always `public` for AUD·A. */
  readonly referencedSchema: string;
  /** Referenced (parent) table. */
  readonly referencedTable: string;
  /** Ordered referenced (parent) column list. */
  readonly referencedColumns: readonly string[];
  readonly onDelete: ForeignKeyReferentialAction;
  readonly onUpdate: ForeignKeyReferentialAction;
  readonly matchType: ForeignKeyMatchType;
  readonly deferrable: boolean;
  readonly initiallyDeferred: boolean;
}

/**
 * OZI-71 AUD·A: the two organization_id FKs added NOT VALID by migration
 * `0023_breezy_sandman.sql`, validated after 0023's transaction commits. The
 * SINGLE source of truth for "the expected FK" — consumed by BOTH the
 * convergence executor and the read-only inspector.
 *
 * 0023 (verbatim): `audit_events` … `ON DELETE set null ON UPDATE no action
 * NOT VALID`; `audit_log_settings` … `ON DELETE cascade ON UPDATE no action
 * NOT VALID`. Neither specifies MATCH or DEFERRABLE, so both are Postgres
 * defaults (MATCH SIMPLE, NOT DEFERRABLE, NOT INITIALLY DEFERRED).
 */
export const AUD_A_DEFERRED_FK_VALIDATIONS: readonly DeferredForeignKeyValidation[] =
  [
    {
      schema: 'public',
      table: 'audit_events',
      constraint: 'audit_events_organization_id_organizations_id_fk',
      columns: ['organization_id'],
      referencedSchema: 'public',
      referencedTable: 'organizations',
      referencedColumns: ['id'],
      onDelete: 'set null',
      onUpdate: 'no action',
      matchType: 'simple',
      deferrable: false,
      initiallyDeferred: false,
    },
    {
      schema: 'public',
      table: 'audit_log_settings',
      constraint: 'audit_log_settings_organization_id_organizations_id_fk',
      columns: ['organization_id'],
      referencedSchema: 'public',
      referencedTable: 'organizations',
      referencedColumns: ['id'],
      onDelete: 'cascade',
      onUpdate: 'no action',
      matchType: 'simple',
      deferrable: false,
      initiallyDeferred: false,
    },
  ];

export type ForeignKeyValidationAction =
  | 'skip'
  | 'validate'
  | 'missing'
  | 'wrong-definition';

export interface DeferredForeignKeyOutcome {
  readonly constraint: string;
  readonly action: ForeignKeyValidationAction;
}

/**
 * Thrown (fail closed, both modes) when a constraint with the expected name
 * exists ON THE EXPECTED `schema.table` but its full structural definition
 * does not match the canonical spec. Schema drift is an operator / schema-
 * repair decision — the FK is NEVER auto-dropped, recreated, or validated.
 */
export class DeferredForeignKeyDefinitionMismatchError extends Error {
  constructor(
    readonly constraintName: string,
    readonly expected: string,
    readonly actual: string,
    readonly mismatches: readonly string[] = [],
  ) {
    super(
      '[post-migrate-steps] foreign key ' +
        JSON.stringify(constraintName) +
        ' exists on its expected table with a different definition; refusing ' +
        'to VALIDATE it (never auto-dropped / recreated). expected: ' +
        expected +
        ' | actual: ' +
        actual +
        (mismatches.length > 0
          ? ' | mismatches: ' + mismatches.join('; ')
          : ''),
    );
    this.name = 'DeferredForeignKeyDefinitionMismatchError';
  }
}

/** `pg_constraint` referential-action codes ↔ SQL text. */
const FK_ACTION_CODE = new Map<ForeignKeyReferentialAction, string>([
  ['no action', 'a'],
  ['restrict', 'r'],
  ['cascade', 'c'],
  ['set null', 'n'],
  ['set default', 'd'],
]);
const FK_ACTION_LABEL = new Map<string, string>([
  ['a', 'no action'],
  ['r', 'restrict'],
  ['c', 'cascade'],
  ['n', 'set null'],
  ['d', 'set default'],
]);
/** `pg_constraint.confmatchtype` codes; older PG emits `u` for simple. */
const FK_MATCH_CODES = new Map<ForeignKeyMatchType, readonly string[]>([
  ['full', ['f']],
  ['partial', ['p']],
  ['simple', ['s', 'u']],
]);
const FK_MATCH_LABEL = new Map<string, string>([
  ['f', 'full'],
  ['p', 'partial'],
  ['s', 'simple'],
  ['u', 'simple'],
]);

/** Tolerant boolean coercion across postgres.js / drizzle / PGlite runners. */
export function toBool(value: unknown): boolean {
  return value === true || value === 't' || value === 'true' || value === 1;
}

function splitColumns(value: string | null): string[] {
  return value ? value.split(',') : [];
}

function orderedEqual(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b.at(i));
}

function fieldDiff(label: string, expected: unknown, actual: unknown): string {
  return `${label}: expected '${String(expected)}', got '${String(actual)}'`;
}

function listDiff(
  label: string,
  expected: readonly string[],
  actual: readonly string[],
): string {
  return `${label}: expected [${expected.join(', ')}], got [${actual.join(', ')}]`;
}

function decodeAction(code: string): string {
  return FK_ACTION_LABEL.get(code) ?? code;
}

function decodeMatch(code: string): string {
  return FK_MATCH_LABEL.get(code) ?? code;
}

/** Canonical human-readable form of an expected FK, for operator diagnostics. */
export function formatExpectedForeignKeyDef(
  spec: DeferredForeignKeyValidation,
): string {
  const match =
    spec.matchType === 'simple' ? '' : ` MATCH ${spec.matchType.toUpperCase()}`;
  const defer = spec.deferrable
    ? ` DEFERRABLE${spec.initiallyDeferred ? ' INITIALLY DEFERRED' : ''}`
    : '';
  return (
    `FOREIGN KEY (${spec.columns.join(', ')}) ` +
    `REFERENCES ${spec.referencedSchema}.${spec.referencedTable} ` +
    `(${spec.referencedColumns.join(', ')}) ` +
    `ON DELETE ${spec.onDelete.toUpperCase()} ` +
    `ON UPDATE ${spec.onUpdate.toUpperCase()}${match}${defer}`
  );
}

/** Raw row shape returned by {@link buildForeignKeyIntrospectionSql}. */
export interface RawForeignKeyRow {
  contype: string;
  source_schema: string;
  source_table: string;
  referenced_schema: string | null;
  referenced_table: string | null;
  confdeltype: string;
  confupdtype: string;
  confmatchtype: string;
  condeferrable: unknown;
  condeferred: unknown;
  convalidated: unknown;
  definition: string;
  local_columns: string | null;
  referenced_columns: string | null;
}

export interface ForeignKeyIntrospection {
  /** A constraint with this name exists ON THE EXPECTED `schema.table`. */
  readonly exists: boolean;
  /** Full structural identity matches the spec (ignores `convalidated`). */
  readonly matchesSpec: boolean;
  /** Rollout state only — `false` when `!exists`. NOT part of identity. */
  readonly convalidated: boolean;
  /** `pg_get_constraintdef(oid, true)` of the actual constraint (diagnostics). */
  readonly definition: string | null;
  /** Field-level differences vs the spec (empty when `matchesSpec`). */
  readonly mismatches: readonly string[];
}

/**
 * Read-only SQL that fetches one `pg_constraint` row (+ resolved schema/table
 * names and ordered attnum→attname column lists) ANCHORED to the expected
 * `spec.schema.spec.table` + `spec.constraint`. A same-named constraint on any
 * other relation does not match the `WHERE`, so `rows[0]` is `undefined`.
 */
export function buildForeignKeyIntrospectionSql(
  spec: DeferredForeignKeyValidation,
): string {
  return (
    'with target as (' +
    'select c.oid, c.conrelid, c.confrelid, c.contype, c.confdeltype, ' +
    'c.confupdtype, c.confmatchtype, c.condeferrable, c.condeferred, ' +
    'c.convalidated, c.conkey, c.confkey, ' +
    'src_ns.nspname as source_schema, src_rel.relname as source_table, ' +
    'ref_ns.nspname as referenced_schema, ref_rel.relname as referenced_table, ' +
    'pg_get_constraintdef(c.oid, true) as definition ' +
    'from pg_constraint c ' +
    'join pg_class src_rel on src_rel.oid = c.conrelid ' +
    'join pg_namespace src_ns on src_ns.oid = src_rel.relnamespace ' +
    'left join pg_class ref_rel on ref_rel.oid = c.confrelid ' +
    'left join pg_namespace ref_ns on ref_ns.oid = ref_rel.relnamespace ' +
    "where src_ns.nspname = '" +
    spec.schema +
    "' and src_rel.relname = '" +
    spec.table +
    "' and c.conname = '" +
    spec.constraint +
    "') " +
    'select t.contype::text as contype, t.source_schema, t.source_table, ' +
    't.referenced_schema, t.referenced_table, ' +
    't.confdeltype::text as confdeltype, t.confupdtype::text as confupdtype, ' +
    't.confmatchtype::text as confmatchtype, ' +
    't.condeferrable, t.condeferred, t.convalidated, t.definition, ' +
    "(select string_agg(a.attname, ',' order by k.ord) " +
    'from unnest(t.conkey) with ordinality as k(attnum, ord) ' +
    'join pg_attribute a on a.attrelid = t.conrelid and a.attnum = k.attnum' +
    ') as local_columns, ' +
    "(select string_agg(a.attname, ',' order by k.ord) " +
    'from unnest(t.confkey) with ordinality as k(attnum, ord) ' +
    'join pg_attribute a on a.attrelid = t.confrelid and a.attnum = k.attnum' +
    ') as referenced_columns ' +
    'from target t'
  );
}

/** Result for a constraint that does not exist on the expected `schema.table`. */
export function absentForeignKeyIntrospection(
  spec: DeferredForeignKeyValidation,
): ForeignKeyIntrospection {
  return {
    exists: false,
    matchesSpec: false,
    convalidated: false,
    definition: null,
    mismatches: [
      'no constraint named ' +
        JSON.stringify(spec.constraint) +
        ' on ' +
        spec.schema +
        '.' +
        spec.table,
    ],
  };
}

/**
 * Pure structural comparison of one raw `pg_constraint` row against the
 * canonical spec. Never touches a database.
 */
export function interpretForeignKeyRow(
  row: RawForeignKeyRow,
  spec: DeferredForeignKeyValidation,
): ForeignKeyIntrospection {
  const localColumns = splitColumns(row.local_columns);
  const referencedColumns = splitColumns(row.referenced_columns);
  const matchOk = (FK_MATCH_CODES.get(spec.matchType) ?? []).includes(
    row.confmatchtype,
  );

  const checks: ReadonlyArray<readonly [boolean, string]> = [
    [
      row.contype === 'f',
      `type: expected FOREIGN KEY, got contype='${row.contype}'`,
    ],
    [
      row.source_schema === spec.schema,
      fieldDiff('source schema', spec.schema, row.source_schema),
    ],
    [
      row.source_table === spec.table,
      fieldDiff('source table', spec.table, row.source_table),
    ],
    [
      row.referenced_schema === spec.referencedSchema,
      fieldDiff(
        'referenced schema',
        spec.referencedSchema,
        row.referenced_schema,
      ),
    ],
    [
      row.referenced_table === spec.referencedTable,
      fieldDiff('referenced table', spec.referencedTable, row.referenced_table),
    ],
    [
      orderedEqual(localColumns, spec.columns),
      listDiff('local columns', spec.columns, localColumns),
    ],
    [
      orderedEqual(referencedColumns, spec.referencedColumns),
      listDiff('referenced columns', spec.referencedColumns, referencedColumns),
    ],
    [
      row.confdeltype === FK_ACTION_CODE.get(spec.onDelete),
      fieldDiff('ON DELETE', spec.onDelete, decodeAction(row.confdeltype)),
    ],
    [
      row.confupdtype === FK_ACTION_CODE.get(spec.onUpdate),
      fieldDiff('ON UPDATE', spec.onUpdate, decodeAction(row.confupdtype)),
    ],
    [
      matchOk,
      fieldDiff('MATCH', spec.matchType, decodeMatch(row.confmatchtype)),
    ],
    [
      toBool(row.condeferrable) === spec.deferrable,
      fieldDiff('deferrable', spec.deferrable, toBool(row.condeferrable)),
    ],
    [
      toBool(row.condeferred) === spec.initiallyDeferred,
      fieldDiff(
        'initially deferred',
        spec.initiallyDeferred,
        toBool(row.condeferred),
      ),
    ],
  ];

  const mismatches = checks.filter((c) => !c[0]).map((c) => c[1]);
  return {
    exists: true,
    matchesSpec: mismatches.length === 0,
    convalidated: toBool(row.convalidated),
    definition: row.definition,
    mismatches,
  };
}

/**
 * Pure decision for one deferred FK, mirroring `decideDeferredIndexAction`.
 * `blocked-missing` — nothing with this name on the expected `schema.table`.
 * `abort-wrong-definition` — present there but a different full definition.
 * `validate` — exact but not yet `convalidated`. `skip` — exact + validated.
 */
export type DeferredForeignKeyAction =
  | { kind: 'blocked-missing' }
  | { kind: 'abort-wrong-definition'; mismatches: readonly string[] }
  | { kind: 'validate' }
  | { kind: 'skip' };

export function decideDeferredForeignKeyAction(
  _spec: DeferredForeignKeyValidation,
  introspected: ForeignKeyIntrospection,
): DeferredForeignKeyAction {
  if (!introspected.exists) return { kind: 'blocked-missing' };
  if (!introspected.matchesSpec) {
    return {
      kind: 'abort-wrong-definition',
      mismatches: introspected.mismatches,
    };
  }
  return introspected.convalidated ? { kind: 'skip' } : { kind: 'validate' };
}

/**
 * What the executor should do for one FK, given its decision and whether this
 * is an `enforce` run. Splitting this pure mapping out keeps
 * `validateDeferredForeignKeys` free of nested mode branching.
 */
export type FkConvergenceInstruction =
  | { kind: 'throw-missing' }
  | { kind: 'throw-mismatch' }
  | { kind: 'report'; action: ForeignKeyValidationAction }
  | { kind: 'validate' };

export function planForeignKeyConvergence(
  decision: DeferredForeignKeyAction,
  enforce: boolean,
): FkConvergenceInstruction {
  switch (decision.kind) {
    case 'blocked-missing':
      return enforce
        ? { kind: 'throw-missing' }
        : { kind: 'report', action: 'missing' };
    case 'abort-wrong-definition':
      return enforce
        ? { kind: 'throw-mismatch' }
        : { kind: 'report', action: 'wrong-definition' };
    case 'skip':
      return { kind: 'report', action: 'skip' };
    case 'validate':
      return enforce
        ? { kind: 'validate' }
        : { kind: 'report', action: 'validate' };
  }
}
