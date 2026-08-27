/** @vitest-environment node */
import { describe, expect, it } from 'vitest';

import {
  buildExplainPreflightArtifact,
  checkArtifactIntegrity,
  checkRegistryCompatibility,
  checkSchemaCompatibility,
  checkTargetCompatibility,
  collectExplainPreflightFacts,
} from './explain-preflight';
import { QUERY_REGISTRY, REQUIRED_SELECT_TABLES } from './query-registry';
import { withReadOnlyDb } from './readonly-db';

/**
 * Real-Postgres proof for the DB-facing half of Phase B1
 * (`collectExplainPreflightFacts`) and for the compatibility checks
 * against genuine collected data, not synthetic fixtures. Local
 * `test-db` only -- no remote connection, no remote credential.
 */
describe('collectExplainPreflightFacts (real DB, local test-db only)', () => {
  it('plain-EXPLAINs all 16 canonical statements and covers exactly the required relation set', async () => {
    const facts = await withReadOnlyDb('test', (tx) =>
      collectExplainPreflightFacts(tx),
    );

    expect(facts.statementPlans).toHaveLength(16);
    expect(facts.statementPlans.map((plan) => plan.id).sort()).toEqual(
      QUERY_REGISTRY.map((statement) => statement.id).sort(),
    );
    for (const plan of facts.statementPlans) {
      expect(plan.facts.nodeType.length).toBeGreaterThan(0);
      expect(plan.rawPlan).toBeTruthy();
    }

    const statCoverage = facts.requiredRelationStats
      .map((stat) => `${stat.schema}.${stat.table}`)
      .sort();
    const requiredCoverage = REQUIRED_SELECT_TABLES.map(
      (table) => `${table.schema}.${table.table}`,
    ).sort();
    expect(statCoverage).toEqual(requiredCoverage);
    for (const stat of facts.requiredRelationStats) {
      expect(typeof stat.estimatedRowCount).toBe('number');
      expect(typeof stat.relPages).toBe('number');
      expect(typeof stat.relationSizeBytes).toBe('number');
      expect(typeof stat.totalRelationSizeBytes).toBe('number');
      expect(typeof stat.indexSizeBytes).toBe('number');
    }
  });

  it('flags exactly the two named priority-manual-review statements', async () => {
    const facts = await withReadOnlyDb('test', (tx) =>
      collectExplainPreflightFacts(tx),
    );
    const priorityIds = facts.statementPlans
      .filter((plan) => plan.isPriorityManualReview)
      .map((plan) => plan.id)
      .sort();
    expect(priorityIds).toEqual(
      ['quota_exceeding_max_users', 'tenant_id_shape_audit_events'].sort(),
    );
  });

  it('parses at least one real multi-node plan into a non-trivial fact tree', async () => {
    const facts = await withReadOnlyDb('test', (tx) =>
      collectExplainPreflightFacts(tx),
    );
    // tenant_organization_counts joins two tables, so its real plan should
    // have at least one level of child nodes -- proves the recursive
    // parser handles genuine Postgres JSON EXPLAIN output, not just the
    // synthetic fixtures in explain-preflight.test.ts.
    const plan = facts.statementPlans.find(
      (p) => p.id === 'tenant_organization_counts',
    );
    expect(plan).toBeDefined();
    expect(plan!.facts.children.length).toBeGreaterThan(0);
  });

  it('captures the real schema migration metadata', async () => {
    const facts = await withReadOnlyDb('test', (tx) =>
      collectExplainPreflightFacts(tx),
    );
    if (facts.schemaMigration) {
      expect(typeof facts.schemaMigration.id).toBe('number');
      expect(typeof facts.schemaMigration.hash).toBe('string');
    }
  });
});

// `environment` is a closed 'staging' | 'production' domain -- this test
// never connects to either; local test-db stands in under a synthetic
// 'staging' label purely to satisfy the type while exercising the real
// collection + fingerprinting/compatibility logic end to end.
const REAL_DATA_CALLER = {
  target: {
    environment: 'staging' as const,
    descriptor: 'test-db (local, standing in for staging in this test)',
  },
  commit: { commitSha: 'test-fixture', workingTreeDirty: false },
};

describe('artifact + compatibility checks against real collected data', () => {
  it('builds an artifact from real facts that is immediately registry-, schema-, target-compatible, and self-integral', async () => {
    const facts = await withReadOnlyDb('test', (tx) =>
      collectExplainPreflightFacts(tx),
    );
    const artifact = buildExplainPreflightArtifact(facts, REAL_DATA_CALLER);

    expect(checkRegistryCompatibility(artifact).compatible).toBe(true);
    expect(
      checkSchemaCompatibility(facts.schemaMigration, artifact).compatible,
    ).toBe(true);
    expect(
      checkTargetCompatibility(REAL_DATA_CALLER.target, artifact).compatible,
    ).toBe(true);
    expect(checkArtifactIntegrity(artifact).compatible).toBe(true);
  });

  it('fails closed when the current schema migration no longer matches the approved artifact', async () => {
    const facts = await withReadOnlyDb('test', (tx) =>
      collectExplainPreflightFacts(tx),
    );
    const artifact = buildExplainPreflightArtifact(facts, REAL_DATA_CALLER);

    const driftedMigration = facts.schemaMigration
      ? { id: facts.schemaMigration.id + 1, hash: 'drifted-hash' }
      : { id: 1, hash: 'drifted-hash' };

    const result = checkSchemaCompatibility(driftedMigration, artifact);
    expect(result.compatible).toBe(false);
  });

  it('fails closed when the current target does not match the approved artifact', async () => {
    const facts = await withReadOnlyDb('test', (tx) =>
      collectExplainPreflightFacts(tx),
    );
    const artifact = buildExplainPreflightArtifact(facts, REAL_DATA_CALLER);

    const result = checkTargetCompatibility(
      {
        environment: 'production',
        descriptor: REAL_DATA_CALLER.target.descriptor,
      },
      artifact,
    );
    expect(result.compatible).toBe(false);
  });

  it('fails closed when a real artifact is mutated after the fact', async () => {
    const facts = await withReadOnlyDb('test', (tx) =>
      collectExplainPreflightFacts(tx),
    );
    const artifact = buildExplainPreflightArtifact(facts, REAL_DATA_CALLER);

    const tampered = {
      ...artifact,
      statementPlans: [
        {
          ...artifact.statementPlans[0]!,
          rawPlan: { 'Node Type': 'Tampered' },
        },
        ...artifact.statementPlans.slice(1),
      ],
    };
    expect(checkArtifactIntegrity(tampered).compatible).toBe(false);
  });
});
