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

export function assertMigrationJournalComplete(
  summary: MigrationJournalSummary,
): void {
  if (summary.missing.length === 0) {
    return;
  }

  const missingTags = summary.missing
    .map((migration) => migration.tag)
    .join(', ');
  throw new Error(
    `[migration-journal] Database migration journal is missing local migration(s): ${missingTags}. ` +
      'The database schema may be behind even if drizzle-kit reported success.',
  );
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
