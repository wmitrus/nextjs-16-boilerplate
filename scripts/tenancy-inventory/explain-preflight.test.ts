import { describe, expect, it } from 'vitest';

import {
  buildExplainPreflightArtifact,
  checkRegistryCompatibility,
  checkSchemaCompatibility,
  parsePlanNode,
  PRIORITY_MANUAL_REVIEW_STATEMENT_IDS,
  type ExplainPreflightArtifactV1,
  type ExplainPreflightFacts,
  type RawExplainPlanNode,
} from './explain-preflight';
import {
  allStatementFingerprints,
  registryFingerprint,
} from './query-registry';

/**
 * `buildExplainPreflightArtifact`/the compatibility checks are the pure
 * half of Phase B1 -- no DB I/O, so these are plain unit tests. The DB-
 * facing half (`collectExplainPreflightFacts`) is covered by
 * `explain-preflight.db.test.ts` against local `test-db` only.
 */

const BASE_FACTS_RAW: ExplainPreflightFacts = {
  schemaMigration: { id: 7, hash: 'abc123' },
  requiredRelationStats: [
    {
      schema: 'public',
      table: 'tenants',
      estimatedRowCount: 42,
      relationSizeBytes: 8192,
      totalRelationSizeBytes: 16384,
    },
  ],
  statementPlans: [
    {
      id: 'tenant_organization_counts',
      kind: 'data',
      isPriorityManualReview: false,
      planningTimeMs: 0.5,
      rawPlan: { 'Node Type': 'Aggregate' },
      facts: { nodeType: 'Aggregate', children: [] },
    },
  ],
};
const BASE_FACTS: ExplainPreflightFacts = Object.freeze(BASE_FACTS_RAW);

const BASE_CALLER = {
  target: { environment: 'local', descriptor: '127.0.0.1:5433/app_test' },
  commit: { commitSha: 'deadbeef', workingTreeDirty: false },
  generatedAt: '2026-08-27T00:00:00.000Z',
};

describe('buildExplainPreflightArtifact', () => {
  it('produces a well-formed v1 artifact that always requires manual review', () => {
    const artifact = buildExplainPreflightArtifact(BASE_FACTS, BASE_CALLER);

    expect(artifact.version).toBe(1);
    expect(artifact.requiresManualReview).toBe(true);
    expect(artifact.target).toEqual(BASE_CALLER.target);
    expect(artifact.commit).toEqual(BASE_CALLER.commit);
    expect(artifact.generatedAt).toBe(BASE_CALLER.generatedAt);
    expect(artifact.schemaMigration).toEqual(BASE_FACTS.schemaMigration);
    expect(artifact.requiredRelationStats).toEqual(
      BASE_FACTS.requiredRelationStats,
    );
    expect(artifact.statementPlans).toEqual(BASE_FACTS.statementPlans);
    expect(artifact.registryFingerprint).toBe(registryFingerprint());
    expect(artifact.statementFingerprints).toEqual(allStatementFingerprints());
    expect(artifact.priorityManualReviewStatementIds).toEqual(
      PRIORITY_MANUAL_REVIEW_STATEMENT_IDS,
    );
    expect(artifact.artifactFingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  it('defaults generatedAt to now when the caller omits it', () => {
    const { generatedAt: _omit, ...callerWithoutTimestamp } = BASE_CALLER;
    const before = Date.now();
    const artifact = buildExplainPreflightArtifact(
      BASE_FACTS,
      callerWithoutTimestamp,
    );
    const after = Date.now();

    const generatedMs = new Date(artifact.generatedAt).getTime();
    expect(generatedMs).toBeGreaterThanOrEqual(before);
    expect(generatedMs).toBeLessThanOrEqual(after);
  });
});

describe('artifact fingerprint', () => {
  it('is deterministic for identical inputs', () => {
    const a = buildExplainPreflightArtifact(BASE_FACTS, BASE_CALLER);
    const b = buildExplainPreflightArtifact(BASE_FACTS, BASE_CALLER);
    expect(a.artifactFingerprint).toBe(b.artifactFingerprint);
  });

  it('changes when the target differs', () => {
    const a = buildExplainPreflightArtifact(BASE_FACTS, BASE_CALLER);
    const b = buildExplainPreflightArtifact(BASE_FACTS, {
      ...BASE_CALLER,
      target: { environment: 'local', descriptor: 'a-different-target' },
    });
    expect(a.artifactFingerprint).not.toBe(b.artifactFingerprint);
  });

  it('changes when the commit differs', () => {
    const a = buildExplainPreflightArtifact(BASE_FACTS, BASE_CALLER);
    const b = buildExplainPreflightArtifact(BASE_FACTS, {
      ...BASE_CALLER,
      commit: { commitSha: 'feedface', workingTreeDirty: false },
    });
    expect(a.artifactFingerprint).not.toBe(b.artifactFingerprint);
  });

  it('changes when the schema migration differs', () => {
    const a = buildExplainPreflightArtifact(BASE_FACTS, BASE_CALLER);
    const b = buildExplainPreflightArtifact(
      { ...BASE_FACTS, schemaMigration: { id: 8, hash: 'different' } },
      BASE_CALLER,
    );
    expect(a.artifactFingerprint).not.toBe(b.artifactFingerprint);
  });

  it('does NOT change when only generatedAt differs', () => {
    const a = buildExplainPreflightArtifact(BASE_FACTS, BASE_CALLER);
    const b = buildExplainPreflightArtifact(BASE_FACTS, {
      ...BASE_CALLER,
      generatedAt: '2099-01-01T00:00:00.000Z',
    });
    expect(a.artifactFingerprint).toBe(b.artifactFingerprint);
  });

  it('does NOT change when only raw plans/relation stats differ (same schema/target/commit/registry)', () => {
    const a = buildExplainPreflightArtifact(BASE_FACTS, BASE_CALLER);
    const b = buildExplainPreflightArtifact(
      {
        ...BASE_FACTS,
        requiredRelationStats: [
          {
            schema: 'public',
            table: 'tenants',
            estimatedRowCount: 999_999,
            relationSizeBytes: 1,
            totalRelationSizeBytes: 1,
          },
        ],
        statementPlans: [
          {
            ...BASE_FACTS.statementPlans[0]!,
            planningTimeMs: 12345,
            rawPlan: { 'Node Type': 'Seq Scan' },
          },
        ],
      },
      BASE_CALLER,
    );
    expect(a.artifactFingerprint).toBe(b.artifactFingerprint);
  });
});

describe('checkRegistryCompatibility', () => {
  it('is compatible when the artifact carries the current registry fingerprint', () => {
    const artifact = buildExplainPreflightArtifact(BASE_FACTS, BASE_CALLER);
    const result = checkRegistryCompatibility(artifact);
    expect(result.compatible).toBe(true);
  });

  it('fails closed when the registry fingerprint no longer matches, and names the drifted statement', () => {
    const artifact = buildExplainPreflightArtifact(BASE_FACTS, BASE_CALLER);
    const tampered: ExplainPreflightArtifactV1 = {
      ...artifact,
      registryFingerprint: 'f'.repeat(64),
      statementFingerprints: artifact.statementFingerprints.map((entry, i) =>
        i === 0 ? { ...entry, fingerprint: 'e'.repeat(64) } : entry,
      ),
    };
    const result = checkRegistryCompatibility(tampered);
    expect(result.compatible).toBe(false);
    expect(result.details?.changed).toContain(
      artifact.statementFingerprints[0]!.id,
    );
  });

  it('fails closed on an artifact missing fingerprint data', () => {
    const result = checkRegistryCompatibility({
      registryFingerprint: '',
      statementFingerprints: [],
    });
    expect(result.compatible).toBe(false);
  });

  it('fails closed when statementFingerprints is not an array', () => {
    const result = checkRegistryCompatibility({
      registryFingerprint: registryFingerprint(),
      // @ts-expect-error -- intentionally malformed for the test
      statementFingerprints: null,
    });
    expect(result.compatible).toBe(false);
  });
});

describe('checkSchemaCompatibility', () => {
  const artifact = buildExplainPreflightArtifact(BASE_FACTS, BASE_CALLER);

  it('is compatible when the current migration exactly matches the approved one', () => {
    const result = checkSchemaCompatibility(
      BASE_FACTS.schemaMigration,
      artifact,
    );
    expect(result.compatible).toBe(true);
  });

  it('fails closed when the current migration id/hash differs', () => {
    const result = checkSchemaCompatibility(
      { id: 999, hash: 'not-the-same' },
      artifact,
    );
    expect(result.compatible).toBe(false);
  });

  it('fails closed when there is no current migration', () => {
    const result = checkSchemaCompatibility(null, artifact);
    expect(result.compatible).toBe(false);
  });

  it('fails closed when the approved artifact recorded no migration', () => {
    const result = checkSchemaCompatibility(BASE_FACTS.schemaMigration, {
      schemaMigration: null,
    });
    expect(result.compatible).toBe(false);
  });
});

describe('parsePlanNode', () => {
  it('parses a single leaf node', () => {
    const node: RawExplainPlanNode = {
      'Node Type': 'Seq Scan',
      'Relation Name': 'tenants',
      Schema: 'public',
      'Startup Cost': 0,
      'Total Cost': 12.3,
      'Plan Rows': 42,
    };
    const fact = parsePlanNode(node);
    expect(fact).toEqual({
      nodeType: 'Seq Scan',
      relationName: 'tenants',
      schema: 'public',
      indexName: undefined,
      joinType: undefined,
      startupCost: 0,
      totalCost: 12.3,
      planRows: 42,
      children: [],
    });
  });

  it('parses nested join/scan plans recursively, at every depth', () => {
    const node: RawExplainPlanNode = {
      'Node Type': 'Hash Join',
      'Join Type': 'Inner',
      'Startup Cost': 1,
      'Total Cost': 100,
      'Plan Rows': 10,
      Plans: [
        {
          'Node Type': 'Seq Scan',
          'Relation Name': 'organizations',
          Schema: 'public',
          'Startup Cost': 0,
          'Total Cost': 10,
          'Plan Rows': 5,
        },
        {
          'Node Type': 'Hash',
          'Startup Cost': 0,
          'Total Cost': 5,
          'Plan Rows': 3,
          Plans: [
            {
              'Node Type': 'Index Scan',
              'Relation Name': 'memberships',
              'Index Name': 'idx_memberships_org_user',
              Schema: 'public',
              'Startup Cost': 0,
              'Total Cost': 3,
              'Plan Rows': 3,
            },
          ],
        },
      ],
    };

    const fact = parsePlanNode(node);

    expect(fact.nodeType).toBe('Hash Join');
    expect(fact.joinType).toBe('Inner');
    expect(fact.children).toHaveLength(2);

    const [scanChild, hashChild] = fact.children;
    expect(scanChild).toMatchObject({
      nodeType: 'Seq Scan',
      relationName: 'organizations',
      children: [],
    });
    expect(hashChild).toMatchObject({ nodeType: 'Hash' });
    expect(hashChild!.children).toHaveLength(1);
    expect(hashChild!.children[0]).toMatchObject({
      nodeType: 'Index Scan',
      relationName: 'memberships',
      indexName: 'idx_memberships_org_user',
    });
    // Three levels deep: Hash Join -> Hash -> Index Scan.
    expect(hashChild!.children[0]!.children).toEqual([]);
  });
});

describe('PRIORITY_MANUAL_REVIEW_STATEMENT_IDS', () => {
  it('names exactly the two statements called out for extra scrutiny', () => {
    expect(PRIORITY_MANUAL_REVIEW_STATEMENT_IDS).toEqual([
      'tenant_id_shape_audit_events',
      'quota_exceeding_max_users',
    ]);
  });
});
