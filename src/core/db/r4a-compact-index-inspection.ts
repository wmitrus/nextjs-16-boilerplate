/** OZI-214 A.1: read-only, fail-closed R4a compact-index inspection. */
import {
  gatherOwnershipDispositionTableEvidence,
  type OwnershipDispositionTableEvidence,
} from './ownership-disposition-gate';

export interface R4aCompactIndexSqlRunner {
  query<T>(statement: string): Promise<T[]>;
}
export type R4aCompactIndexTable = 'feature_flags' | 'audit_log_settings';
export type R4aCompactIndexDecision =
  | 'already-converged'
  | 'eligible-to-create'
  | 'blocked-by-disposition'
  | 'blocked-by-schema-drift'
  | 'invalid-index-recovery-required';
export interface R4aCompactIndexSpec {
  readonly table: R4aCompactIndexTable;
  readonly index: string;
  readonly columns: readonly [string, string];
}
interface KeySpec {
  readonly column: string;
  readonly opclass: string;
  readonly collation: string | null;
}
interface ExpectedIndexSpec {
  readonly name: string;
  readonly keys: readonly KeySpec[];
  readonly nullsNotDistinct: boolean;
  readonly predicate: string | null;
  readonly definition: string;
}
interface TableIndexSpec extends R4aCompactIndexSpec {
  readonly requiredIndexes: readonly ExpectedIndexSpec[];
}

function expected(
  name: string,
  table: R4aCompactIndexTable,
  keys: readonly KeySpec[],
  nullsNotDistinct: boolean,
  predicate: string | null,
): ExpectedIndexSpec {
  const keyDefinition = keys.map((key) => key.column).join(', ');
  return {
    name,
    keys,
    nullsNotDistinct,
    predicate,
    definition:
      `CREATE UNIQUE INDEX ${name} ON public.${table} USING btree (${keyDefinition})` +
      (nullsNotDistinct ? ' NULLS NOT DISTINCT' : '') +
      (predicate === canonicalPredicate
        ? " WHERE ((organization_id IS NOT NULL) AND (ownership_state = 'canonical_organization'::text))"
        : predicate === globalPredicate
          ? " WHERE (ownership_state = 'intentional_global'::text)"
          : predicate
            ? ` WHERE ${predicate}`
            : ''),
  };
}
const textKey = (column: string): KeySpec => ({
  column,
  opclass: 'text_ops',
  collation: 'default',
});
const uuidKey = (column: string): KeySpec => ({
  column,
  opclass: 'uuid_ops',
  collation: null,
});
const enumKey = (column: string): KeySpec => ({
  column,
  opclass: 'enum_ops',
  collation: null,
});
const canonicalPredicate =
  "organization_id IS NOT NULL AND ownership_state = 'canonical_organization'::text";
const globalPredicate = "ownership_state = 'intentional_global'::text";
export const R4A_COMPACT_INDEX_SPECS: readonly R4aCompactIndexSpec[] = [
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
] as const;
const TABLE_SPECS: readonly TableIndexSpec[] = R4A_COMPACT_INDEX_SPECS.map(
  (spec) => ({
    ...spec,
    requiredIndexes:
      spec.table === 'feature_flags'
        ? [
            expected(
              'uq_feature_flags_key_tenant',
              spec.table,
              [textKey('key'), textKey('tenant_id')],
              true,
              null,
            ),
            expected(
              'uq_feature_flags_key_organization_canonical',
              spec.table,
              [textKey('key'), uuidKey('organization_id')],
              false,
              canonicalPredicate,
            ),
            expected(
              'uq_feature_flags_key_intentional_global',
              spec.table,
              [textKey('key')],
              false,
              globalPredicate,
            ),
          ]
        : [
            expected(
              'uq_audit_log_settings_category_tenant',
              spec.table,
              [enumKey('category'), textKey('tenant_id')],
              true,
              null,
            ),
            expected(
              'uq_audit_log_settings_category_organization_canonical',
              spec.table,
              [enumKey('category'), uuidKey('organization_id')],
              false,
              canonicalPredicate,
            ),
            expected(
              'uq_audit_log_settings_category_intentional_global',
              spec.table,
              [enumKey('category')],
              false,
              globalPredicate,
            ),
          ],
  }),
);

export interface R4aCatalogKeyEvidence {
  readonly position: number;
  readonly column: string | null;
  readonly expression: string | null;
  readonly opclass: string | null;
  readonly collation: string | null;
}
export interface R4aCatalogIndexEvidence {
  readonly name: string;
  readonly exists: boolean;
  readonly schema: string | null;
  readonly tableSchema: string | null;
  readonly table: string | null;
  readonly unique: boolean | null;
  readonly accessMethod: string | null;
  readonly keys: readonly R4aCatalogKeyEvidence[];
  readonly includeColumns: readonly string[];
  readonly nullsNotDistinct: boolean | null;
  readonly predicate: string | null;
  readonly valid: boolean | null;
  readonly ready: boolean | null;
  readonly live: boolean | null;
  readonly definition: string | null;
  readonly relationKind: string | null;
  readonly hasPgIndex: boolean | null;
  readonly exact: boolean;
}
export interface R4aCompactIndexInspection {
  readonly spec: R4aCompactIndexSpec;
  readonly target: R4aCatalogIndexEvidence;
  readonly requiredLegacyAndSemanticIndexes: readonly R4aCatalogIndexEvidence[];
  readonly ownership: OwnershipDispositionTableEvidence | null;
  readonly catalogAvailable: boolean;
  readonly decision: R4aCompactIndexDecision;
  readonly reasons: readonly string[];
}
interface CatalogRow {
  readonly index_schema: unknown;
  readonly table_schema: unknown;
  readonly table_name: unknown;
  readonly indisunique: unknown;
  readonly amname: unknown;
  readonly key_attributes: unknown;
  readonly include_columns: unknown;
  readonly indnullsnotdistinct: unknown;
  readonly predicate: unknown;
  readonly indisvalid: unknown;
  readonly indisready: unknown;
  readonly indislive: unknown;
  readonly definition: unknown;
  readonly relkind: unknown;
  readonly has_pg_index: unknown;
}
function bool(value: unknown): boolean | null {
  return value === true || value === 't' || value === 'true' || value === 1
    ? true
    : value === false || value === 'f' || value === 'false' || value === 0
      ? false
      : null;
}
function string(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}
function keys(value: unknown): readonly R4aCatalogKeyEvidence[] | null {
  if (!Array.isArray(value)) return null;
  const result: R4aCatalogKeyEvidence[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') return null;
    const record = item as Record<string, unknown>;
    const column = string(record.column);
    const expression = string(record.expression);
    const opclass = string(record.opclass);
    const collation = string(record.collation);
    if (
      !Number.isSafeInteger(record.position) ||
      (column === null && expression === null) ||
      opclass === null
    )
      return null;
    result.push({
      position: record.position as number,
      column,
      expression,
      opclass,
      collation,
    });
  }
  return result;
}
function includes(value: unknown): readonly string[] | null {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
    ? value
    : null;
}
function unavailable(name: string): R4aCatalogIndexEvidence {
  return {
    name,
    exists: false,
    schema: null,
    tableSchema: null,
    table: null,
    unique: null,
    accessMethod: null,
    keys: [],
    includeColumns: [],
    nullsNotDistinct: null,
    predicate: null,
    valid: null,
    ready: null,
    live: null,
    definition: null,
    relationKind: null,
    hasPgIndex: null,
    exact: false,
  };
}
function exact(
  evidence: Omit<R4aCatalogIndexEvidence, 'exact'>,
  wanted: ExpectedIndexSpec,
  table: R4aCompactIndexTable,
): boolean {
  return (
    evidence.exists &&
    evidence.relationKind === 'i' &&
    evidence.hasPgIndex === true &&
    evidence.schema === 'public' &&
    evidence.tableSchema === 'public' &&
    evidence.table === table &&
    evidence.unique === true &&
    evidence.accessMethod === 'btree' &&
    evidence.nullsNotDistinct === wanted.nullsNotDistinct &&
    evidence.predicate === wanted.predicate &&
    evidence.definition === wanted.definition &&
    evidence.includeColumns.length === 0 &&
    evidence.keys.length === wanted.keys.length &&
    evidence.keys.every((key, index) => {
      const expectedKey = wanted.keys.at(index);
      return (
        expectedKey !== undefined &&
        key.position === index + 1 &&
        key.column === expectedKey.column &&
        key.expression === null &&
        key.opclass === expectedKey.opclass &&
        key.collation === expectedKey.collation
      );
    })
  );
}
async function inspectIndex(
  runner: R4aCompactIndexSqlRunner,
  wanted: ExpectedIndexSpec,
  table: R4aCompactIndexTable,
): Promise<R4aCatalogIndexEvidence> {
  const rows = await runner.query<CatalogRow>(
    `SELECT index_ns.nspname AS index_schema, index_rel.relkind, idx.indexrelid IS NOT NULL AS has_pg_index, table_ns.nspname AS table_schema, table_rel.relname AS table_name, idx.indisunique, am.amname, json_agg(json_build_object('position', key_column.ordinality, 'column', att.attname, 'expression', CASE WHEN key_column.attnum = 0 THEN pg_get_indexdef(idx.indexrelid, key_column.ordinality::integer, true) END, 'opclass', opc.opcname, 'collation', coll.collname) ORDER BY key_column.ordinality) FILTER (WHERE key_column.ordinality <= idx.indnkeyatts) AS key_attributes, array_agg(att.attname ORDER BY key_column.ordinality) FILTER (WHERE key_column.ordinality > idx.indnkeyatts) AS include_columns, idx.indnullsnotdistinct, pg_get_expr(idx.indpred, idx.indrelid, true) AS predicate, idx.indisvalid, idx.indisready, idx.indislive, pg_get_indexdef(idx.indexrelid) AS definition FROM pg_class index_rel JOIN pg_namespace index_ns ON index_ns.oid = index_rel.relnamespace LEFT JOIN pg_index idx ON idx.indexrelid = index_rel.oid LEFT JOIN pg_class table_rel ON table_rel.oid = idx.indrelid LEFT JOIN pg_namespace table_ns ON table_ns.oid = table_rel.relnamespace LEFT JOIN pg_am am ON am.oid = index_rel.relam LEFT JOIN LATERAL unnest(idx.indkey) WITH ORDINALITY AS key_column(attnum, ordinality) ON true LEFT JOIN pg_attribute att ON att.attrelid = idx.indrelid AND att.attnum = key_column.attnum LEFT JOIN LATERAL unnest(idx.indclass) WITH ORDINALITY AS class_oid(opcoid, ordinality) ON class_oid.ordinality = key_column.ordinality LEFT JOIN pg_opclass opc ON opc.oid = class_oid.opcoid LEFT JOIN LATERAL unnest(idx.indcollation) WITH ORDINALITY AS collation_oid(colloid, ordinality) ON collation_oid.ordinality = key_column.ordinality LEFT JOIN pg_collation coll ON coll.oid = collation_oid.colloid WHERE index_rel.relname = '${wanted.name}' GROUP BY index_ns.nspname, index_rel.relkind, idx.indexrelid, table_ns.nspname, table_rel.relname, idx.indisunique, am.amname, idx.indnullsnotdistinct, idx.indpred, idx.indrelid, idx.indisvalid, idx.indisready, idx.indislive`,
  );
  if (rows.length === 0) return unavailable(wanted.name);
  if (rows.length !== 1) throw new Error('ambiguous index catalog evidence');
  const row = rows[0]!;
  const inspectedKeys = keys(row.key_attributes);
  const includeColumns =
    includes(row.include_columns) ?? (row.include_columns === null ? [] : null);
  if (!inspectedKeys || !includeColumns)
    throw new Error('incomplete index catalog evidence');
  const evidence = {
    name: wanted.name,
    exists: true,
    schema: string(row.index_schema),
    tableSchema: string(row.table_schema),
    table: string(row.table_name),
    unique: bool(row.indisunique),
    accessMethod: string(row.amname),
    keys: inspectedKeys,
    includeColumns,
    nullsNotDistinct: bool(row.indnullsnotdistinct),
    predicate: string(row.predicate),
    valid: bool(row.indisvalid),
    ready: bool(row.indisready),
    live: bool(row.indislive),
    definition: string(row.definition),
    relationKind: string(row.relkind),
    hasPgIndex: bool(row.has_pg_index),
  };
  return { ...evidence, exact: exact(evidence, wanted, table) };
}
function compact(spec: R4aCompactIndexSpec): ExpectedIndexSpec {
  return expected(
    spec.index,
    spec.table,
    spec.table === 'feature_flags'
      ? [textKey('key'), uuidKey('organization_id')]
      : [enumKey('category'), uuidKey('organization_id')],
    true,
    null,
  );
}
function dispositionReady(
  evidence: OwnershipDispositionTableEvidence,
): boolean {
  return (
    evidence.gate === 'r4a' &&
    evidence.gateReady &&
    evidence.counts.unresolvedLegacy === 0 &&
    evidence.counts.quarantined === 0 &&
    evidence.invalidCombinationCount === 0 &&
    evidence.constraint.state === 'exact-validated'
  );
}
/** SELECT-only. Never reads audit_events, opens a connection, or mutates schema/data. */
export async function inspectR4aCompactIndex(
  runner: R4aCompactIndexSqlRunner,
  table: R4aCompactIndexTable,
): Promise<R4aCompactIndexInspection> {
  const spec = TABLE_SPECS.find((candidate) => candidate.table === table);
  if (!spec)
    throw new Error(
      `[r4a-compact-index-inspection] unsupported table: ${table}`,
    );
  let ownership: OwnershipDispositionTableEvidence | null = null;
  let target = unavailable(spec.index);
  let required: readonly R4aCatalogIndexEvidence[] = [];
  try {
    [ownership, target, required] = await Promise.all([
      gatherOwnershipDispositionTableEvidence(runner, table),
      inspectIndex(runner, compact(spec), table),
      Promise.all(
        spec.requiredIndexes.map((index) => inspectIndex(runner, index, table)),
      ),
    ]);
  } catch {
    return {
      spec,
      target,
      requiredLegacyAndSemanticIndexes: required,
      ownership,
      catalogAvailable: false,
      decision: 'blocked-by-schema-drift',
      reasons: ['catalog-or-ownership-evidence-unavailable'],
    };
  }
  const requiredIntact = required.every(
    (index) =>
      index.exact &&
      index.valid === true &&
      index.ready === true &&
      index.live === true,
  );
  if (!requiredIntact)
    return {
      spec,
      target,
      requiredLegacyAndSemanticIndexes: required,
      ownership,
      catalogAvailable: true,
      decision: 'blocked-by-schema-drift',
      reasons: ['legacy-or-semantic-index-not-intact'],
    };
  if (target.exists && !target.exact)
    return {
      spec,
      target,
      requiredLegacyAndSemanticIndexes: required,
      ownership,
      catalogAvailable: true,
      decision: 'blocked-by-schema-drift',
      reasons: ['compact-index-wrong-identity-or-definition'],
    };
  if (
    target.exists &&
    (target.valid !== true || target.ready !== true || target.live !== true)
  )
    return {
      spec,
      target,
      requiredLegacyAndSemanticIndexes: required,
      ownership,
      catalogAvailable: true,
      decision: 'invalid-index-recovery-required',
      reasons: ['exact-identity-index-not-valid-ready-and-live'],
    };
  if (!ownership || !dispositionReady(ownership))
    return {
      spec,
      target,
      requiredLegacyAndSemanticIndexes: required,
      ownership,
      catalogAvailable: true,
      decision: 'blocked-by-disposition',
      reasons: ['table-specific-ownership-disposition-not-ready'],
    };
  return {
    spec,
    target,
    requiredLegacyAndSemanticIndexes: required,
    ownership,
    catalogAvailable: true,
    decision: target.exists ? 'already-converged' : 'eligible-to-create',
    reasons: [
      target.exists
        ? 'exact-compact-index-valid-ready-and-live'
        : 'table-specific-disposition-ready-and-schema-intact',
    ],
  };
}
