import { describe, expect, it } from 'vitest';

import {
  buildExplainPreflightArtifact,
  checkArtifactIntegrity,
  checkRegistryCompatibility,
  checkSchemaCompatibility,
  checkTargetCompatibility,
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
      relPages: 3,
      relationSizeBytes: 8192,
      totalRelationSizeBytes: 16384,
      indexSizeBytes: 8192,
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

// `environment` is a closed 'staging' | 'production' domain -- these
// tests never connect to either; the value is only a type-satisfying
// label exercising the pure artifact-assembly/fingerprint logic.
const BASE_CALLER = {
  target: {
    environment: 'staging' as const,
    descriptor: 'staging-db.internal:5432/app_staging',
  },
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
    expect(artifact.scopeFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(artifact.artifactFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(artifact.scopeFingerprint).not.toBe(artifact.artifactFingerprint);
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

describe('scopeFingerprint -- stable, cross-run "what was reviewed" identity', () => {
  it('is deterministic for identical inputs', () => {
    const a = buildExplainPreflightArtifact(BASE_FACTS, BASE_CALLER);
    const b = buildExplainPreflightArtifact(BASE_FACTS, BASE_CALLER);
    expect(a.scopeFingerprint).toBe(b.scopeFingerprint);
  });

  it('changes when the target differs', () => {
    const a = buildExplainPreflightArtifact(BASE_FACTS, BASE_CALLER);
    const b = buildExplainPreflightArtifact(BASE_FACTS, {
      ...BASE_CALLER,
      target: { environment: 'production', descriptor: 'a-different-target' },
    });
    expect(a.scopeFingerprint).not.toBe(b.scopeFingerprint);
  });

  it('changes when the commit differs', () => {
    const a = buildExplainPreflightArtifact(BASE_FACTS, BASE_CALLER);
    const b = buildExplainPreflightArtifact(BASE_FACTS, {
      ...BASE_CALLER,
      commit: { commitSha: 'feedface', workingTreeDirty: false },
    });
    expect(a.scopeFingerprint).not.toBe(b.scopeFingerprint);
  });

  it('changes when the schema migration differs', () => {
    const a = buildExplainPreflightArtifact(BASE_FACTS, BASE_CALLER);
    const b = buildExplainPreflightArtifact(
      { ...BASE_FACTS, schemaMigration: { id: 8, hash: 'different' } },
      BASE_CALLER,
    );
    expect(a.scopeFingerprint).not.toBe(b.scopeFingerprint);
  });

  it('does NOT change when only generatedAt differs', () => {
    const a = buildExplainPreflightArtifact(BASE_FACTS, BASE_CALLER);
    const b = buildExplainPreflightArtifact(BASE_FACTS, {
      ...BASE_CALLER,
      generatedAt: '2099-01-01T00:00:00.000Z',
    });
    expect(a.scopeFingerprint).toBe(b.scopeFingerprint);
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
            relPages: 1,
            relationSizeBytes: 1,
            totalRelationSizeBytes: 1,
            indexSizeBytes: 1,
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
    expect(a.scopeFingerprint).toBe(b.scopeFingerprint);
  });
});

describe('artifactFingerprint -- exact-evidence identity of one artifact instance', () => {
  it('is deterministic for identical inputs', () => {
    const a = buildExplainPreflightArtifact(BASE_FACTS, BASE_CALLER);
    const b = buildExplainPreflightArtifact(BASE_FACTS, BASE_CALLER);
    expect(a.artifactFingerprint).toBe(b.artifactFingerprint);
  });

  it('changes when the target differs', () => {
    const a = buildExplainPreflightArtifact(BASE_FACTS, BASE_CALLER);
    const b = buildExplainPreflightArtifact(BASE_FACTS, {
      ...BASE_CALLER,
      target: { environment: 'production', descriptor: 'a-different-target' },
    });
    expect(a.artifactFingerprint).not.toBe(b.artifactFingerprint);
  });

  it('changes when only generatedAt differs', () => {
    const a = buildExplainPreflightArtifact(BASE_FACTS, BASE_CALLER);
    const b = buildExplainPreflightArtifact(BASE_FACTS, {
      ...BASE_CALLER,
      generatedAt: '2099-01-01T00:00:00.000Z',
    });
    expect(a.artifactFingerprint).not.toBe(b.artifactFingerprint);
  });

  it('changes when a raw plan differs, even with identical scope', () => {
    const a = buildExplainPreflightArtifact(BASE_FACTS, BASE_CALLER);
    const b = buildExplainPreflightArtifact(
      {
        ...BASE_FACTS,
        statementPlans: [
          {
            ...BASE_FACTS.statementPlans[0]!,
            rawPlan: { 'Node Type': 'Seq Scan' },
          },
        ],
      },
      BASE_CALLER,
    );
    expect(a.scopeFingerprint).toBe(b.scopeFingerprint);
    expect(a.artifactFingerprint).not.toBe(b.artifactFingerprint);
  });

  it('changes when relation stats differ, even with identical scope', () => {
    const a = buildExplainPreflightArtifact(BASE_FACTS, BASE_CALLER);
    const b = buildExplainPreflightArtifact(
      {
        ...BASE_FACTS,
        requiredRelationStats: [
          { ...BASE_FACTS.requiredRelationStats[0]!, estimatedRowCount: 1 },
        ],
      },
      BASE_CALLER,
    );
    expect(a.scopeFingerprint).toBe(b.scopeFingerprint);
    expect(a.artifactFingerprint).not.toBe(b.artifactFingerprint);
  });

  it('is insensitive to statementPlans/requiredRelationStats array order (sorted by id/schema+table)', () => {
    const twoStatementFacts: ExplainPreflightFacts = {
      ...BASE_FACTS,
      requiredRelationStats: [
        {
          schema: 'public',
          table: 'organizations',
          estimatedRowCount: 1,
          relPages: 1,
          relationSizeBytes: 1,
          totalRelationSizeBytes: 1,
          indexSizeBytes: 1,
        },
        {
          schema: 'public',
          table: 'tenants',
          estimatedRowCount: 1,
          relPages: 1,
          relationSizeBytes: 1,
          totalRelationSizeBytes: 1,
          indexSizeBytes: 1,
        },
      ],
      statementPlans: [
        BASE_FACTS.statementPlans[0]!,
        {
          id: 'policies_with_null_organization_count',
          kind: 'data',
          isPriorityManualReview: false,
          rawPlan: { 'Node Type': 'Seq Scan' },
          facts: { nodeType: 'Seq Scan', children: [] },
        },
      ],
    };
    const reordered: ExplainPreflightFacts = {
      ...twoStatementFacts,
      requiredRelationStats: [
        ...twoStatementFacts.requiredRelationStats,
      ].reverse(),
      statementPlans: [...twoStatementFacts.statementPlans].reverse(),
    };

    const a = buildExplainPreflightArtifact(twoStatementFacts, BASE_CALLER);
    const b = buildExplainPreflightArtifact(reordered, BASE_CALLER);
    expect(a.artifactFingerprint).toBe(b.artifactFingerprint);
  });

  it('is sensitive to plan.children order (a semantically ordered sequence, never sorted)', () => {
    const childA: RawExplainPlanNode = {
      'Node Type': 'Seq Scan',
      'Relation Name': 'a',
    };
    const childB: RawExplainPlanNode = {
      'Node Type': 'Seq Scan',
      'Relation Name': 'b',
    };
    const factsAB: ExplainPreflightFacts = {
      ...BASE_FACTS,
      statementPlans: [
        {
          ...BASE_FACTS.statementPlans[0]!,
          rawPlan: { 'Node Type': 'Hash Join', Plans: [childA, childB] },
          facts: parsePlanNode({
            'Node Type': 'Hash Join',
            Plans: [childA, childB],
          }),
        },
      ],
    };
    const factsBA: ExplainPreflightFacts = {
      ...BASE_FACTS,
      statementPlans: [
        {
          ...BASE_FACTS.statementPlans[0]!,
          rawPlan: { 'Node Type': 'Hash Join', Plans: [childB, childA] },
          facts: parsePlanNode({
            'Node Type': 'Hash Join',
            Plans: [childB, childA],
          }),
        },
      ],
    };

    const a = buildExplainPreflightArtifact(factsAB, BASE_CALLER);
    const b = buildExplainPreflightArtifact(factsBA, BASE_CALLER);
    expect(a.artifactFingerprint).not.toBe(b.artifactFingerprint);
  });
});

describe('checkArtifactIntegrity', () => {
  it('is compatible for a freshly built, untouched artifact', () => {
    const artifact = buildExplainPreflightArtifact(BASE_FACTS, BASE_CALLER);
    expect(checkArtifactIntegrity(artifact).compatible).toBe(true);
  });

  it('fails closed when a raw plan is mutated after the fact', () => {
    const artifact = buildExplainPreflightArtifact(BASE_FACTS, BASE_CALLER);
    const tampered: ExplainPreflightArtifactV1 = {
      ...artifact,
      statementPlans: [
        {
          ...artifact.statementPlans[0]!,
          rawPlan: { 'Node Type': 'Tampered' },
        },
      ],
    };
    expect(checkArtifactIntegrity(tampered).compatible).toBe(false);
  });

  it('fails closed when generatedAt is mutated after the fact', () => {
    const artifact = buildExplainPreflightArtifact(BASE_FACTS, BASE_CALLER);
    const tampered: ExplainPreflightArtifactV1 = {
      ...artifact,
      generatedAt: '1999-01-01T00:00:00.000Z',
    };
    expect(checkArtifactIntegrity(tampered).compatible).toBe(false);
  });

  it('fails closed when relation stats are mutated after the fact', () => {
    const artifact = buildExplainPreflightArtifact(BASE_FACTS, BASE_CALLER);
    const tampered: ExplainPreflightArtifactV1 = {
      ...artifact,
      requiredRelationStats: [
        { ...artifact.requiredRelationStats[0]!, estimatedRowCount: 0 },
      ],
    };
    expect(checkArtifactIntegrity(tampered).compatible).toBe(false);
  });

  it('fails closed when the fingerprint itself is blank', () => {
    const artifact = buildExplainPreflightArtifact(BASE_FACTS, BASE_CALLER);
    const tampered: ExplainPreflightArtifactV1 = {
      ...artifact,
      artifactFingerprint: '',
    };
    expect(checkArtifactIntegrity(tampered).compatible).toBe(false);
  });
});

describe('checkRegistryCompatibility', () => {
  it('is compatible when the artifact carries the current registry fingerprint and full statement set', () => {
    const artifact = buildExplainPreflightArtifact(BASE_FACTS, BASE_CALLER);
    const result = checkRegistryCompatibility(artifact);
    expect(result.compatible).toBe(true);
  });

  it('fails closed when the top-level registry fingerprint no longer matches, and names the drifted statement', () => {
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

  /**
   * The hardening this whole describe block below proves: a *correct*
   * top-level registryFingerprint string does not, by itself, prove the
   * artifact's own statementFingerprints array is structurally sound.
   * Each case keeps registryFingerprint set to the real, current value
   * while tampering only with statementFingerprints.
   */
  describe('independently validates statementFingerprints even when registryFingerprint matches', () => {
    it('fails closed when a statement entry is missing', () => {
      const entries = allStatementFingerprints();
      const result = checkRegistryCompatibility({
        registryFingerprint: registryFingerprint(),
        statementFingerprints: entries.slice(1),
      });
      expect(result.compatible).toBe(false);
      expect(result.details?.missing).toContain(entries[0]!.id);
    });

    it('fails closed when an extra/unknown statement entry is present', () => {
      const entries = allStatementFingerprints();
      const result = checkRegistryCompatibility({
        registryFingerprint: registryFingerprint(),
        statementFingerprints: [
          ...entries,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- deliberately an unknown id for the test
          { id: 'not_a_real_statement_id' as any, fingerprint: 'd'.repeat(64) },
        ],
      });
      expect(result.compatible).toBe(false);
      expect(result.details?.extra).toContain('not_a_real_statement_id');
    });

    it('fails closed when a statement entry is duplicated', () => {
      const entries = allStatementFingerprints();
      const result = checkRegistryCompatibility({
        registryFingerprint: registryFingerprint(),
        statementFingerprints: [...entries, entries[0]!],
      });
      expect(result.compatible).toBe(false);
      expect(result.details?.duplicated).toContain(entries[0]!.id);
    });

    it("fails closed when a statement entry's fingerprint value is changed", () => {
      const entries = allStatementFingerprints();
      const result = checkRegistryCompatibility({
        registryFingerprint: registryFingerprint(),
        statementFingerprints: entries.map((entry, i) =>
          i === 0 ? { ...entry, fingerprint: 'c'.repeat(64) } : entry,
        ),
      });
      expect(result.compatible).toBe(false);
      expect(result.details?.changed).toContain(entries[0]!.id);
    });
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

describe('checkTargetCompatibility', () => {
  const artifact = buildExplainPreflightArtifact(BASE_FACTS, BASE_CALLER);

  it('is compatible when environment and descriptor exactly match', () => {
    const result = checkTargetCompatibility(BASE_CALLER.target, artifact);
    expect(result.compatible).toBe(true);
  });

  it('fails closed when the environment differs (staging artifact vs. production target)', () => {
    const result = checkTargetCompatibility(
      { environment: 'production', descriptor: BASE_CALLER.target.descriptor },
      artifact,
    );
    expect(result.compatible).toBe(false);
  });

  it('fails closed when the descriptor differs within the same environment', () => {
    const result = checkTargetCompatibility(
      {
        environment: 'staging',
        descriptor: 'a-different-staging-host:5432/app',
      },
      artifact,
    );
    expect(result.compatible).toBe(false);
  });

  it('fails closed when the current target is missing fields', () => {
    const incompleteTarget = { environment: 'staging' };
    const result = checkTargetCompatibility(
      // @ts-expect-error -- intentionally malformed for the test
      incompleteTarget,
      artifact,
    );
    expect(result.compatible).toBe(false);
  });

  it('fails closed when the approved artifact is missing target metadata', () => {
    const result = checkTargetCompatibility(BASE_CALLER.target, {
      // @ts-expect-error -- intentionally malformed for the test
      target: undefined,
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
