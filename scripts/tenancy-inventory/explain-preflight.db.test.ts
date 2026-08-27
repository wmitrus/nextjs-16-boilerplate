/** @vitest-environment node */
import { describe, expect, it } from 'vitest';

import {
  buildExplainPreflightArtifact,
  checkRegistryCompatibility,
  checkSchemaCompatibility,
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
      expect(typeof stat.relationSizeBytes).toBe('number');
      expect(typeof stat.totalRelationSizeBytes).toBe('number');
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

describe('artifact + compatibility checks against real collected data', () => {
  it('builds an artifact from real facts that is immediately registry- and schema-compatible with itself', async () => {
    const facts = await withReadOnlyDb('test', (tx) =>
      collectExplainPreflightFacts(tx),
    );
    const artifact = buildExplainPreflightArtifact(facts, {
      target: { environment: 'local', descriptor: 'test-db (local)' },
      commit: { commitSha: 'test-fixture', workingTreeDirty: false },
    });

    expect(checkRegistryCompatibility(artifact).compatible).toBe(true);
    expect(
      checkSchemaCompatibility(facts.schemaMigration, artifact).compatible,
    ).toBe(true);
  });

  it('fails closed when the current schema migration no longer matches the approved artifact', async () => {
    const facts = await withReadOnlyDb('test', (tx) =>
      collectExplainPreflightFacts(tx),
    );
    const artifact = buildExplainPreflightArtifact(facts, {
      target: { environment: 'local', descriptor: 'test-db (local)' },
      commit: { commitSha: 'test-fixture', workingTreeDirty: false },
    });

    const driftedMigration = facts.schemaMigration
      ? { id: facts.schemaMigration.id + 1, hash: 'drifted-hash' }
      : { id: 1, hash: 'drifted-hash' };

    const result = checkSchemaCompatibility(driftedMigration, artifact);
    expect(result.compatible).toBe(false);
  });
});
