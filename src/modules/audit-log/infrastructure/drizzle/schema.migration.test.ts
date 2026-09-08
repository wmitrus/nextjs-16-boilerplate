import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  AUDIT_EVENTS_OWNERSHIP_STATES,
  AUDIT_LOG_SETTINGS_OWNERSHIP_STATES,
} from './schema';

/**
 * OZI-71 AUD·A ships exactly ONE journaled migration:
 *
 *  - 0023 — `ADD COLUMN` ×4, `ADD FK … NOT VALID` ×2, small indexes on the
 *    (empty) `audit_log_settings`, both ownership `CHECK … NOT VALID`.
 *
 * The two operations that need transaction isolation — `VALIDATE CONSTRAINT`
 * for the FKs, and building `idx_audit_events_organization_occurred` with
 * `CREATE INDEX CONCURRENTLY` — are NOT journaled migrations: drizzle's
 * migrator wraps every pending migration in ONE transaction, so a separate
 * `.sql` file is not a separate transaction. They run in the AUD·A
 * post-migrate step (`src/core/db/post-migrate-steps.ts`), covered by
 * `src/core/db/post-migrate-steps.{test,db.test}.ts`.
 *
 * None of the later-slice constructs (global partial unique = AUD·D; compact
 * `NULLS NOT DISTINCT` canonical unique = R4a-1; legacy-column drop = R4a-2)
 * appear here.
 */

const GEN_DIR = resolve(process.cwd(), 'src/core/db/migrations/generated');

/** Executable SQL only — `--` comment lines dropped so "must not contain X"
 * assertions test the DDL, not the explanatory comments. */
const read = (file: string) =>
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  readFileSync(resolve(GEN_DIR, file), 'utf8')
    .split('\n')
    .filter((line) => !/^\s*--/.test(line))
    .join('\n');

const EXPAND_SQL = read('0023_breezy_sandman.sql');
const JOURNAL = JSON.parse(read('meta/_journal.json')) as {
  entries: Array<{ idx: number; tag: string }>;
};

const sqlFiles = () => readdirSync(GEN_DIR).filter((f) => f.endsWith('.sql'));
/** Executable DDL of a generated migration, `--` comment lines removed. */
const ddl = (file: string) => read(file);

describe('0023 AUD·A expand migration SQL contract', () => {
  it('adds organization_id as a nullable uuid with no default on both tables', () => {
    for (const table of ['audit_events', 'audit_log_settings']) {
      expect(EXPAND_SQL).toContain(
        `ALTER TABLE "${table}" ADD COLUMN "organization_id" uuid;`,
      );
      const line = EXPAND_SQL.split('\n').find((l) =>
        l.includes(`ALTER TABLE "${table}" ADD COLUMN "organization_id"`),
      );
      expect(line).toBeDefined();
      expect(line).not.toMatch(/DEFAULT/i);
      expect(line).not.toMatch(/NOT NULL/i);
    }
  });

  it('initializes every pre-existing row to unresolved_legacy via a constant NOT NULL default, never a global-eligible state (§14a.9)', () => {
    for (const table of ['audit_events', 'audit_log_settings']) {
      expect(EXPAND_SQL).toContain(
        `ALTER TABLE "${table}" ADD COLUMN "ownership_state" text DEFAULT 'unresolved_legacy' NOT NULL;`,
      );
    }
    expect(EXPAND_SQL).not.toMatch(/DEFAULT 'intentional_global'/);
    expect(EXPAND_SQL).not.toMatch(/DEFAULT 'canonical_organization'/);
    expect(EXPAND_SQL).not.toMatch(/DEFAULT 'organization_owned_orphaned'/);
    expect(EXPAND_SQL).not.toMatch(/DEFAULT 'quarantined'/);
  });

  it('adds the audit_events FK with ON DELETE SET NULL, NOT VALID (§14a.3 / FK rollout)', () => {
    expect(EXPAND_SQL).toContain(
      'ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action NOT VALID;',
    );
    expect(EXPAND_SQL).not.toMatch(
      /audit_events[^;]*organization_id[^;]*ON DELETE cascade/i,
    );
  });

  it('adds the audit_log_settings FK with ON DELETE CASCADE, NOT VALID (§14a.3 / FK rollout)', () => {
    expect(EXPAND_SQL).toContain(
      'ALTER TABLE "audit_log_settings" ADD CONSTRAINT "audit_log_settings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action NOT VALID;',
    );
    expect(EXPAND_SQL).not.toMatch(
      /audit_log_settings[^;]*organization_id[^;]*ON DELETE set null/i,
    );
  });

  it('does NOT create the audit_events organization index (that is the post-migrate step)', () => {
    expect(EXPAND_SQL).not.toMatch(/idx_audit_events_organization_occurred/);
  });

  it('adds the audit_log_settings non-unique (category, organization_id) lookup index', () => {
    expect(EXPAND_SQL).toContain(
      'CREATE INDEX "idx_audit_log_settings_category_organization" ON "audit_log_settings" USING btree ("category","organization_id");',
    );
  });

  it('adds only the scoped canonical partial unique on audit_log_settings with the exact predicate (§14a.8)', () => {
    expect(EXPAND_SQL).toContain(
      `CREATE UNIQUE INDEX "uq_audit_log_settings_category_organization_canonical" ON "audit_log_settings" USING btree ("category","organization_id") WHERE "audit_log_settings"."organization_id" is not null and "audit_log_settings"."ownership_state" = 'canonical_organization';`,
    );
    // No global semantic unique (AUD·D) and no compact canonical unique (R4a-1).
    expect(EXPAND_SQL).not.toMatch(
      /WHERE[^;]*ownership_state" = 'intentional_global'/,
    );
    expect(EXPAND_SQL).not.toMatch(
      /UNIQUE[^;]*\("category","organization_id"\)[^;]*NULLS NOT DISTINCT/i,
    );
  });

  it('adds the audit_events ownership CHECK — canonical_organization unconstrained on org id, every other state requires NULL (§14a.9)', () => {
    expect(EXPAND_SQL).toContain(
      `ALTER TABLE "audit_events" ADD CONSTRAINT "ck_audit_events_ownership_state_org" CHECK (("audit_events"."ownership_state" = 'canonical_organization') or ("audit_events"."ownership_state" in ('organization_owned_orphaned', 'intentional_global', 'unresolved_legacy', 'quarantined') and "audit_events"."organization_id" is null)) NOT VALID;`,
    );
    for (const state of AUDIT_EVENTS_OWNERSHIP_STATES) {
      expect(EXPAND_SQL).toContain(`'${state}'`);
    }
  });

  it('adds the audit_log_settings ownership CHECK — feature_flags shape (§14a.9)', () => {
    expect(EXPAND_SQL).toContain(
      `ALTER TABLE "audit_log_settings" ADD CONSTRAINT "ck_audit_log_settings_ownership_state_org" CHECK (("audit_log_settings"."ownership_state" = 'canonical_organization' and "audit_log_settings"."organization_id" is not null) or ("audit_log_settings"."ownership_state" in ('intentional_global', 'unresolved_legacy', 'quarantined') and "audit_log_settings"."organization_id" is null)) NOT VALID;`,
    );
    for (const state of AUDIT_LOG_SETTINGS_OWNERSHIP_STATES) {
      expect(EXPAND_SQL).toContain(`'${state}'`);
    }
  });

  it('installs both CHECKs as NOT VALID and never validates anything in 0023', () => {
    const notValidChecks = [
      ...EXPAND_SQL.matchAll(
        /ADD CONSTRAINT "ck_[a-z_]+" CHECK \([^;]*\) NOT VALID;/g,
      ),
    ];
    expect(notValidChecks).toHaveLength(2);
    expect(EXPAND_SQL).not.toMatch(/VALIDATE CONSTRAINT/i);
  });

  it('does not touch the legacy uniqueness constraints or tenant_id', () => {
    expect(EXPAND_SQL).not.toMatch(/uq_audit_log_settings_category_tenant/);
    expect(EXPAND_SQL).not.toMatch(/idx_audit_events_tenant_occurred/);
    expect(EXPAND_SQL).not.toMatch(/ALTER COLUMN "tenant_id"/i);
  });

  it('contains no destructive DDL', () => {
    expect(EXPAND_SQL).not.toMatch(/DROP COLUMN/i);
    expect(EXPAND_SQL).not.toMatch(/DROP TABLE/i);
    expect(EXPAND_SQL).not.toMatch(/RENAME/i);
  });

  it('touches only the two audit tables', () => {
    const tableRefs = [...EXPAND_SQL.matchAll(/ALTER TABLE "([a-z_]+)"/g)].map(
      (m) => m[1],
    );
    expect(new Set(tableRefs)).toEqual(
      new Set(['audit_events', 'audit_log_settings']),
    );
  });
});

describe('AUD·A is exactly one journaled migration', () => {
  it('0023 is the only new journal entry — no FK-validation or index migration', () => {
    const tail = JOURNAL.entries.slice(-1).map((e) => `${e.idx}:${e.tag}`);
    expect(tail).toEqual(['23:0023_breezy_sandman']);
    const tags = JOURNAL.entries.map((e) => e.tag);
    expect(tags).not.toContain('0024_aud_a_validate_organization_fks');
    expect(tags).not.toContain('0025_aud_a_audit_events_organization_index');
  });

  it('journal idx values are consecutive and in order', () => {
    const idxs = JOURNAL.entries.map((e) => e.idx);
    expect(idxs).toEqual([...idxs].sort((a, b) => a - b));
    expect(idxs[idxs.length - 1] - idxs[0]).toBe(idxs.length - 1);
  });

  it('NO journaled .sql migration builds idx_audit_events_organization_occurred (drizzle wraps every migration in one txn; the index is a post-migrate step)', () => {
    const offenders = sqlFiles().filter((f) =>
      ddl(f)
        .split(';')
        .some(
          (stmt) =>
            /create\s.*index/i.test(stmt) &&
            stmt.includes('idx_audit_events_organization_occurred'),
        ),
    );
    expect(offenders).toEqual([]);
  });

  it('NO journaled .sql migration issues VALIDATE CONSTRAINT (same-transaction hazard — validation is a post-migrate step)', () => {
    const offenders = sqlFiles().filter((f) =>
      /VALIDATE CONSTRAINT/i.test(ddl(f)),
    );
    expect(offenders).toEqual([]);
  });
});
