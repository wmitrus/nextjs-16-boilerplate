import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

import postgres from 'postgres';

type JournalMeta = {
  entries: Array<{
    tag: string;
  }>;
};

export type ExpectedMigration = {
  tag: string;
  hash: string;
};

export type MigrationJournalSummary = {
  expectedCount: number;
  recordedCount: number;
  missing: ExpectedMigration[];
  duplicateHashes: string[];
  unknownHashes: string[];
};

export type KnownMigrationDriftRepairSummary = {
  dryRun: boolean;
  repaired: string[];
  skipped: Array<{
    tag: string;
    reason: string;
  }>;
};

const JOURNAL_FILE = resolve(
  process.cwd(),
  'src/core/db/migrations/generated/meta/_journal.json',
);

const MIGRATIONS_DIR = resolve(
  process.cwd(),
  'src/core/db/migrations/generated',
);

export async function resolveExpectedMigrations(): Promise<
  ExpectedMigration[]
> {
  const journalRaw = await readFile(JOURNAL_FILE, 'utf8');
  const journal = JSON.parse(journalRaw) as JournalMeta;

  return Promise.all(
    journal.entries.map(async (entry) => {
      const sql = await readMigrationSql(entry.tag);
      return {
        tag: entry.tag,
        hash: createHash('sha256').update(sql).digest('hex'),
      };
    }),
  );
}

async function readMigrationSql(tag: string): Promise<Buffer> {
  switch (tag) {
    case '0000_rainy_lenny_balinger':
      return readFile(resolve(MIGRATIONS_DIR, '0000_rainy_lenny_balinger.sql'));
    case '0001_unique_richard_fisk':
      return readFile(resolve(MIGRATIONS_DIR, '0001_unique_richard_fisk.sql'));
    case '0002_slimy_sharon_ventura':
      return readFile(resolve(MIGRATIONS_DIR, '0002_slimy_sharon_ventura.sql'));
    case '0003_panoramic_nextwave':
      return readFile(resolve(MIGRATIONS_DIR, '0003_panoramic_nextwave.sql'));
    case '0004_cool_morgan_stark':
      return readFile(resolve(MIGRATIONS_DIR, '0004_cool_morgan_stark.sql'));
    case '0005_generic_profile_fields':
      return readFile(
        resolve(MIGRATIONS_DIR, '0005_generic_profile_fields.sql'),
      );
    case '0006_breezy_scarlet_spider':
      return readFile(
        resolve(MIGRATIONS_DIR, '0006_breezy_scarlet_spider.sql'),
      );
    case '0007_zippy_gorilla_man':
      return readFile(resolve(MIGRATIONS_DIR, '0007_zippy_gorilla_man.sql'));
    case '0008_auth_foundation_redesign':
      return readFile(
        resolve(MIGRATIONS_DIR, '0008_auth_foundation_redesign.sql'),
      );
    case '0009_authjs_credentials':
      return readFile(resolve(MIGRATIONS_DIR, '0009_authjs_credentials.sql'));
    case '0010_password_reset_tokens':
      return readFile(
        resolve(MIGRATIONS_DIR, '0010_password_reset_tokens.sql'),
      );
    case '0011_email_verification_tokens':
      return readFile(
        resolve(MIGRATIONS_DIR, '0011_email_verification_tokens.sql'),
      );
    case '0012_users_deactivated_at':
      return readFile(resolve(MIGRATIONS_DIR, '0012_users_deactivated_at.sql'));
    case '0013_reconcile_snapshot':
      return readFile(resolve(MIGRATIONS_DIR, '0013_reconcile_snapshot.sql'));
    case '0014_authjs_credentials_identity_backfill':
      return readFile(
        resolve(
          MIGRATIONS_DIR,
          '0014_authjs_credentials_identity_backfill.sql',
        ),
      );
    case '0015_messy_doctor_faustus':
      return readFile(resolve(MIGRATIONS_DIR, '0015_messy_doctor_faustus.sql'));
    case '0016_wise_norman_osborn':
      return readFile(resolve(MIGRATIONS_DIR, '0016_wise_norman_osborn.sql'));
    case '0017_shiny_starbolt':
      return readFile(resolve(MIGRATIONS_DIR, '0017_shiny_starbolt.sql'));
    case '0018_busy_mad_thinker':
      return readFile(resolve(MIGRATIONS_DIR, '0018_busy_mad_thinker.sql'));
    case '0019_rare_outlaw_kid':
      return readFile(resolve(MIGRATIONS_DIR, '0019_rare_outlaw_kid.sql'));
    case '0020_sour_hitman':
      return readFile(resolve(MIGRATIONS_DIR, '0020_sour_hitman.sql'));
    case '0021_sweet_thaddeus_ross':
      return readFile(resolve(MIGRATIONS_DIR, '0021_sweet_thaddeus_ross.sql'));
    default:
      throw new Error(
        `[migration-journal] Unsupported journal entry ${tag}. Add it to readMigrationSql().`,
      );
  }
}

export function summarizeMigrationJournal(
  expected: ExpectedMigration[],
  recordedHashes: string[],
): MigrationJournalSummary {
  const recordedCounts = new Map<string, number>();
  for (const hash of recordedHashes) {
    recordedCounts.set(hash, (recordedCounts.get(hash) ?? 0) + 1);
  }

  const expectedHashes = new Set(expected.map((migration) => migration.hash));

  return {
    expectedCount: expected.length,
    recordedCount: recordedHashes.length,
    missing: expected.filter(
      (migration) => !recordedCounts.has(migration.hash),
    ),
    duplicateHashes: [...recordedCounts.entries()]
      .filter(([, count]) => count > 1)
      .map(([hash]) => hash),
    unknownHashes: [...recordedCounts.keys()].filter(
      (hash) => !expectedHashes.has(hash),
    ),
  };
}

/**
 * A valid Production migration journal must be *exact*: every expected
 * migration recorded, and nothing else. Fails closed on any of the three
 * drift categories `summarizeMigrationJournal` detects -- not just `missing`.
 *
 * `duplicateHashes` (a migration recorded more than once) and `unknownHashes`
 * (a recorded hash with no local journal entry, e.g. a retired/historical
 * migration) are exactly the drift discovered during the OZI-78 live
 * Production validation. A database that contains every expected migration
 * PLUS extra rows previously passed this assertion; it no longer does.
 *
 * This never repairs anything -- it only reports which invariant category
 * failed (missing / duplicate / unknown) and by how much. No connection
 * string, credential, or other environment value is included.
 */
export function assertMigrationJournalComplete(
  summary: MigrationJournalSummary,
): void {
  const violations: string[] = [];

  if (summary.missing.length > 0) {
    const missingTags = summary.missing
      .map((migration) => migration.tag)
      .join(', ');
    violations.push(
      `missing: database is missing local migration(s): ${missingTags} ` +
        '(the schema may be behind even if drizzle-kit reported success)',
    );
  }

  if (summary.duplicateHashes.length > 0) {
    violations.push(
      `duplicate: ${summary.duplicateHashes.length} recorded migration hash(es) ` +
        'appear more than once in drizzle.__drizzle_migrations',
    );
  }

  if (summary.unknownHashes.length > 0) {
    violations.push(
      `unknown: ${summary.unknownHashes.length} recorded migration hash(es) ` +
        'are not present in the local journal (retired/historical drift)',
    );
  }

  if (violations.length === 0) {
    return;
  }

  throw new Error(
    '[migration-journal] Database migration journal is not exact:\n' +
      violations.map((violation) => `  - ${violation}`).join('\n'),
  );
}

function findExpectedMigration(
  expected: ExpectedMigration[],
  tag: string,
): ExpectedMigration {
  const migration = expected.find((entry) => entry.tag === tag);
  if (!migration) {
    throw new Error(
      `[migration-journal] Missing local journal entry for ${tag}`,
    );
  }
  return migration;
}

async function hasHash(sql: postgres.Sql, hash: string): Promise<boolean> {
  const rows = await sql`
    select 1 as present
    from drizzle.__drizzle_migrations
    where hash = ${hash}
    limit 1
  `;
  return Boolean(rows[0]);
}

async function hasColumn(
  sql: postgres.Sql,
  tableName: string,
  columnName: string,
): Promise<boolean> {
  const rows = await sql`
    select 1 as present
    from information_schema.columns
    where table_schema = 'public'
      and table_name = ${tableName}
      and column_name = ${columnName}
    limit 1
  `;
  return Boolean(rows[0]);
}

async function hasTable(
  sql: postgres.Sql,
  tableName: string,
): Promise<boolean> {
  const rows = await sql`
    select 1 as present
    from information_schema.tables
    where table_schema = 'public'
      and table_name = ${tableName}
    limit 1
  `;
  return Boolean(rows[0]);
}

async function hasAuthFoundationRedesignArtifacts(
  sql: postgres.Sql,
): Promise<boolean> {
  const requiredTables = [
    'organizations',
    'auth_organization_identities',
    'invitations',
    'waitlist_entries',
  ];

  for (const tableName of requiredTables) {
    if (!(await hasTable(sql, tableName))) {
      return false;
    }
  }

  const requiredColumns: Array<[string, string]> = [
    ['tenants', 'slug'],
    ['tenants', 'status'],
    ['memberships', 'organization_id'],
    ['roles', 'organization_id'],
    ['policies', 'organization_id'],
    ['tenant_attributes', 'max_organizations'],
  ];

  for (const [tableName, columnName] of requiredColumns) {
    if (!(await hasColumn(sql, tableName, columnName))) {
      return false;
    }
  }

  return true;
}

async function insertMigrationHash(
  sql: postgres.Sql,
  migration: ExpectedMigration,
): Promise<void> {
  await sql`
    insert into drizzle.__drizzle_migrations (hash, created_at)
    values (${migration.hash}, ${Date.now()})
  `;
}

export async function repairKnownMigrationJournalDrift(options: {
  connectionString: string;
  dryRun?: boolean;
}): Promise<KnownMigrationDriftRepairSummary> {
  const expected = await resolveExpectedMigrations();
  const sql = postgres(options.connectionString, {
    prepare: false,
    max: 1,
    idle_timeout: 5,
    connect_timeout: 10,
  });

  const dryRun = options.dryRun ?? false;
  const repaired: string[] = [];
  const skipped: KnownMigrationDriftRepairSummary['skipped'] = [];

  try {
    const journalTable = await sql`
      select to_regclass('drizzle.__drizzle_migrations') as name
    `;

    if (!journalTable[0]?.name) {
      return {
        dryRun,
        repaired,
        skipped: [
          {
            tag: '*',
            reason: 'journal-table-missing',
          },
        ],
      };
    }

    const authFoundation = findExpectedMigration(
      expected,
      '0008_auth_foundation_redesign',
    );
    if (!(await hasHash(sql, authFoundation.hash))) {
      if (await hasAuthFoundationRedesignArtifacts(sql)) {
        if (!dryRun) {
          await insertMigrationHash(sql, authFoundation);
        }
        repaired.push(authFoundation.tag);
      } else {
        skipped.push({
          tag: authFoundation.tag,
          reason: 'schema-artifacts-missing',
        });
      }
    }

    const usersDeactivatedAt = findExpectedMigration(
      expected,
      '0012_users_deactivated_at',
    );
    if (!(await hasHash(sql, usersDeactivatedAt.hash))) {
      if (!dryRun) {
        await sql`
          alter table public.users
          add column if not exists deactivated_at timestamp with time zone
        `;
        await insertMigrationHash(sql, usersDeactivatedAt);
      }
      repaired.push(usersDeactivatedAt.tag);
    }

    const reconcileSnapshot = findExpectedMigration(
      expected,
      '0013_reconcile_snapshot',
    );
    if (!(await hasHash(sql, reconcileSnapshot.hash))) {
      if (!dryRun) {
        await insertMigrationHash(sql, reconcileSnapshot);
      }
      repaired.push(reconcileSnapshot.tag);
    }

    return {
      dryRun,
      repaired,
      skipped,
    };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export async function validateMigrationJournal(options: {
  connectionString: string;
}): Promise<MigrationJournalSummary> {
  const expected = await resolveExpectedMigrations();
  const sql = postgres(options.connectionString, {
    prepare: false,
    max: 1,
    idle_timeout: 5,
    connect_timeout: 10,
  });

  try {
    const journalTable = await sql`
      select to_regclass('drizzle.__drizzle_migrations') as name
    `;

    if (!journalTable[0]?.name) {
      return {
        expectedCount: expected.length,
        recordedCount: 0,
        missing: expected,
        duplicateHashes: [],
        unknownHashes: [],
      };
    }

    const recorded = await sql`
      select hash
      from drizzle.__drizzle_migrations
    `;

    return summarizeMigrationJournal(
      expected,
      recorded.map((row) => row.hash as string),
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export function formatMigrationJournalSummary(
  summary: MigrationJournalSummary,
): Record<string, unknown> {
  return {
    expectedCount: summary.expectedCount,
    recordedCount: summary.recordedCount,
    missing: summary.missing.map((migration) => migration.tag),
    duplicateHashCount: summary.duplicateHashes.length,
    unknownHashCount: summary.unknownHashes.length,
  };
}

const isMain =
  typeof process.argv[1] === 'string' &&
  basename(process.argv[1]) === 'validate-migration-journal.ts';

if (isMain) {
  const connectionString =
    process.env.DATABASE_URL_UNPOOLED?.trim() ||
    process.env.DATABASE_URL?.trim();

  if (!connectionString) {
    console.error(
      '[migration-journal] DATABASE_URL_UNPOOLED or DATABASE_URL is required.',
    );
    process.exit(1);
  }

  validateMigrationJournal({ connectionString })
    .then((summary) => {
      console.log(
        JSON.stringify(formatMigrationJournalSummary(summary), null, 2),
      );
      assertMigrationJournalComplete(summary);
    })
    .catch((error: unknown) => {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error(err.message);
      process.exit(1);
    });
}
