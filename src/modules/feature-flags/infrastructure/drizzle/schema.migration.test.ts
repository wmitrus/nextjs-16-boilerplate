import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { FEATURE_FLAG_OWNERSHIP_STATES } from './schema';

/**
 * OZI-71 FF·A — asserts the generated migration is a genuinely additive expand
 * step: every pre-existing row is initialized to the fail-closed
 * `unresolved_legacy` (never `intentional_global`), and none of the
 * later-slice constructs (global partial unique = FF·D; compact
 * `NULLS NOT DISTINCT` canonical unique = R4a-1; legacy-column drop = R4a-2)
 * appear here.
 */

const MIGRATION_SQL = readFileSync(
  resolve(
    process.cwd(),
    'src/core/db/migrations/generated/0021_sweet_thaddeus_ross.sql',
  ),
  'utf8',
);

describe('0021 FF·A migration SQL contract', () => {
  it('adds organization_id as a nullable uuid with no default', () => {
    expect(MIGRATION_SQL).toContain(
      'ALTER TABLE "feature_flags" ADD COLUMN "organization_id" uuid;',
    );
    expect(MIGRATION_SQL).not.toMatch(
      /ADD COLUMN "organization_id"[^;]*DEFAULT/i,
    );
    expect(MIGRATION_SQL).not.toMatch(
      /ADD COLUMN "organization_id"[^;]*NOT NULL/i,
    );
  });

  it('initializes every pre-existing row to unresolved_legacy via a constant NOT NULL default, never intentional_global (§10.1)', () => {
    expect(MIGRATION_SQL).toContain(
      `ALTER TABLE "feature_flags" ADD COLUMN "ownership_state" text DEFAULT 'unresolved_legacy' NOT NULL;`,
    );
    expect(MIGRATION_SQL).not.toMatch(/DEFAULT 'intentional_global'/);
    expect(MIGRATION_SQL).not.toMatch(/DEFAULT 'canonical_organization'/);
    expect(MIGRATION_SQL).not.toMatch(/DEFAULT 'quarantined'/);
  });

  it('adds the organizations FK with ON DELETE CASCADE and ON UPDATE NO ACTION', () => {
    expect(MIGRATION_SQL).toContain(
      'ADD CONSTRAINT "feature_flags_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action',
    );
    expect(MIGRATION_SQL).not.toMatch(
      /organization_id[^;]*ON DELETE set null/i,
    );
  });

  it('adds a non-unique (key, organization_id) lookup index', () => {
    expect(MIGRATION_SQL).toContain(
      'CREATE INDEX "idx_feature_flags_key_organization" ON "feature_flags" USING btree ("key","organization_id");',
    );
  });

  it('adds only the scoped canonical partial unique with the exact predicate (§14.8)', () => {
    expect(MIGRATION_SQL).toContain(
      `CREATE UNIQUE INDEX "uq_feature_flags_key_organization_canonical" ON "feature_flags" USING btree ("key","organization_id") WHERE "feature_flags"."organization_id" is not null and "feature_flags"."ownership_state" = 'canonical_organization';`,
    );
    // No global semantic unique (FF·D) and no compact canonical unique (R4a-1).
    expect(MIGRATION_SQL).not.toMatch(
      /WHERE[^;]*ownership_state" = 'intentional_global'/,
    );
    expect(MIGRATION_SQL).not.toMatch(
      /UNIQUE[^;]*\("key","organization_id"\)[^;]*NULLS NOT DISTINCT/i,
    );
  });

  it('adds the ownership_state ↔ organization_id CHECK with the exact predicate covering the full domain (§14.9)', () => {
    expect(MIGRATION_SQL).toContain(
      `ADD CONSTRAINT "ck_feature_flags_ownership_state_org" CHECK (("feature_flags"."ownership_state" = 'canonical_organization' and "feature_flags"."organization_id" is not null) or ("feature_flags"."ownership_state" in ('intentional_global', 'unresolved_legacy', 'quarantined') and "feature_flags"."organization_id" is null))`,
    );
    for (const state of FEATURE_FLAG_OWNERSHIP_STATES) {
      expect(MIGRATION_SQL).toContain(`'${state}'`);
    }
  });

  it('installs the CHECK as NOT VALID and defers validation (§14a.9 staged rollout)', () => {
    // The staged rollout: enforce for new/changed rows now, defer the historical
    // back-scan to `VALIDATE CONSTRAINT` at the later plan gate.
    expect(MIGRATION_SQL).toMatch(
      /ADD CONSTRAINT "ck_feature_flags_ownership_state_org" CHECK \([^;]*\) NOT VALID;/,
    );
    // No `VALIDATE CONSTRAINT` DDL in FF·A (matched as a statement, not prose).
    expect(MIGRATION_SQL).not.toMatch(/ALTER TABLE[^;]*VALIDATE CONSTRAINT/i);
  });

  it('does not touch the legacy uq_feature_flags_key_tenant unique', () => {
    expect(MIGRATION_SQL).not.toMatch(/uq_feature_flags_key_tenant/);
  });

  it('contains no destructive DDL (no DROP COLUMN / DROP TABLE / rename)', () => {
    expect(MIGRATION_SQL).not.toMatch(/DROP COLUMN/i);
    expect(MIGRATION_SQL).not.toMatch(/DROP TABLE/i);
    expect(MIGRATION_SQL).not.toMatch(/RENAME/i);
    expect(MIGRATION_SQL).not.toMatch(/ALTER COLUMN "tenant_id"/i);
  });

  it('touches only the feature_flags table', () => {
    const tableRefs = [
      ...MIGRATION_SQL.matchAll(/ALTER TABLE "([a-z_]+)"/g),
    ].map((m) => m[1]);
    expect(new Set(tableRefs)).toEqual(new Set(['feature_flags']));
    const createdOn = [
      ...MIGRATION_SQL.matchAll(/CREATE (?:UNIQUE )?INDEX[^;]*ON "([a-z_]+)"/g),
    ].map((m) => m[1]);
    expect(new Set(createdOn)).toEqual(new Set(['feature_flags']));
  });
});
