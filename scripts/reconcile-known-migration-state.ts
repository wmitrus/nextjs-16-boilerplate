import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import postgres from 'postgres';

type JournalMeta = {
  entries: Array<{
    tag: string;
    when: number;
  }>;
};

export type KnownMigrationTag =
  | '0010_password_reset_tokens'
  | '0011_email_verification_tokens';

type KnownMigrationDefinition = {
  tag: KnownMigrationTag;
  tableName: string;
  requiredColumns: string[];
  requiredIndexes: string[];
  requiredConstraints: string[];
};

export type ResolvedKnownMigration = KnownMigrationDefinition & {
  hash: string;
  createdAt: number;
};

export type MigrationArtifactInspection = {
  tableExists: boolean;
  columns: string[];
  indexes: string[];
  constraints: string[];
};

export type ReconciliationDecision =
  | {
      tag: KnownMigrationTag;
      action: 'already-recorded';
      reason: 'hash-present';
    }
  | {
      tag: KnownMigrationTag;
      action: 'skip';
      reason: 'table-missing' | 'schema-incomplete';
      missingColumns: string[];
      missingIndexes: string[];
      missingConstraints: string[];
    }
  | {
      tag: KnownMigrationTag;
      action: 'backfill';
      reason: 'schema-already-present';
      hash: string;
      createdAt: number;
    };

export type ReconciliationSummary = {
  journalTablePresent: boolean;
  dryRun: boolean;
  decisions: ReconciliationDecision[];
  appliedTags: KnownMigrationTag[];
};

const JOURNAL_FILE = resolve(
  process.cwd(),
  'src/core/db/migrations/generated/meta/_journal.json',
);

const MIGRATIONS_DIR = resolve(
  process.cwd(),
  'src/core/db/migrations/generated',
);

const KNOWN_MIGRATIONS: KnownMigrationDefinition[] = [
  {
    tag: '0010_password_reset_tokens',
    tableName: 'password_reset_tokens',
    requiredColumns: [
      'id',
      'user_id',
      'token_hash',
      'expires_at',
      'used_at',
      'created_at',
    ],
    requiredIndexes: [
      'idx_password_reset_tokens_user',
      'idx_password_reset_tokens_hash',
    ],
    requiredConstraints: [
      'password_reset_tokens_pkey',
      'password_reset_tokens_token_hash_unique',
      'password_reset_tokens_user_id_users_id_fk',
    ],
  },
  {
    tag: '0011_email_verification_tokens',
    tableName: 'email_verification_tokens',
    requiredColumns: [
      'id',
      'user_id',
      'token_hash',
      'expires_at',
      'used_at',
      'created_at',
    ],
    requiredIndexes: [
      'idx_email_verification_tokens_user',
      'idx_email_verification_tokens_hash',
    ],
    requiredConstraints: [
      'email_verification_tokens_pkey',
      'email_verification_tokens_token_hash_unique',
      'email_verification_tokens_user_id_users_id_fk',
    ],
  },
];

function listMissing(required: string[], actual: string[]): string[] {
  const actualSet = new Set(actual);
  return required.filter((item) => !actualSet.has(item));
}

export function evaluateReconciliationDecision(
  migration: ResolvedKnownMigration,
  hashPresent: boolean,
  inspection: MigrationArtifactInspection,
): ReconciliationDecision {
  if (hashPresent) {
    return {
      tag: migration.tag,
      action: 'already-recorded',
      reason: 'hash-present',
    };
  }

  if (!inspection.tableExists) {
    return {
      tag: migration.tag,
      action: 'skip',
      reason: 'table-missing',
      missingColumns: migration.requiredColumns,
      missingIndexes: migration.requiredIndexes,
      missingConstraints: migration.requiredConstraints,
    };
  }

  const missingColumns = listMissing(
    migration.requiredColumns,
    inspection.columns,
  );
  const missingIndexes = listMissing(
    migration.requiredIndexes,
    inspection.indexes,
  );
  const missingConstraints = listMissing(
    migration.requiredConstraints,
    inspection.constraints,
  );

  if (
    missingColumns.length > 0 ||
    missingIndexes.length > 0 ||
    missingConstraints.length > 0
  ) {
    return {
      tag: migration.tag,
      action: 'skip',
      reason: 'schema-incomplete',
      missingColumns,
      missingIndexes,
      missingConstraints,
    };
  }

  return {
    tag: migration.tag,
    action: 'backfill',
    reason: 'schema-already-present',
    hash: migration.hash,
    createdAt: migration.createdAt,
  };
}

async function resolveKnownMigrations(): Promise<ResolvedKnownMigration[]> {
  const journalRaw = await readFile(JOURNAL_FILE, 'utf8');
  const journal = JSON.parse(journalRaw) as JournalMeta;

  return Promise.all(
    KNOWN_MIGRATIONS.map(async (migration) => {
      const entry = journal.entries.find((item) => item.tag === migration.tag);
      if (!entry) {
        throw new Error(
          `[reconcile-known-migration-state] Missing journal entry for ${migration.tag}`,
        );
      }

      let sql: Buffer;
      switch (migration.tag) {
        case '0010_password_reset_tokens':
          sql = await readFile(
            resolve(MIGRATIONS_DIR, '0010_password_reset_tokens.sql'),
          );
          break;
        case '0011_email_verification_tokens':
          sql = await readFile(
            resolve(MIGRATIONS_DIR, '0011_email_verification_tokens.sql'),
          );
          break;
      }
      const hash = createHash('sha256').update(sql).digest('hex');

      return {
        ...migration,
        hash,
        createdAt: entry.when,
      };
    }),
  );
}

async function inspectMigrationArtifacts(
  sql: postgres.Sql,
  migration: ResolvedKnownMigration,
): Promise<MigrationArtifactInspection> {
  const columns = await sql`
    select column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name = ${migration.tableName}
    order by ordinal_position
  `;

  if (columns.length === 0) {
    return {
      tableExists: false,
      columns: [],
      indexes: [],
      constraints: [],
    };
  }

  const indexes = await sql`
    select indexname
    from pg_indexes
    where schemaname = 'public'
      and tablename = ${migration.tableName}
    order by indexname asc
  `;

  const constraints = await sql`
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = ${migration.tableName}
    order by c.conname asc
  `;

  return {
    tableExists: true,
    columns: columns.map((row) => row.column_name as string),
    indexes: indexes.map((row) => row.indexname as string),
    constraints: constraints.map((row) => row.conname as string),
  };
}

export async function reconcileKnownMigrationState(options: {
  connectionString: string;
  dryRun?: boolean;
}): Promise<ReconciliationSummary> {
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
        journalTablePresent: false,
        dryRun: options.dryRun ?? false,
        decisions: [],
        appliedTags: [],
      };
    }

    const migrations = await resolveKnownMigrations();
    const recorded = await sql`
      select hash
      from drizzle.__drizzle_migrations
    `;
    const recordedHashes = new Set(recorded.map((row) => row.hash as string));

    const decisions: ReconciliationDecision[] = [];
    for (const migration of migrations) {
      const inspection = await inspectMigrationArtifacts(sql, migration);
      decisions.push(
        evaluateReconciliationDecision(
          migration,
          recordedHashes.has(migration.hash),
          inspection,
        ),
      );
    }

    const appliedTags: KnownMigrationTag[] = [];
    if (!(options.dryRun ?? false)) {
      for (const decision of decisions) {
        if (decision.action !== 'backfill') {
          continue;
        }

        await sql`
          insert into drizzle.__drizzle_migrations (hash, created_at)
          select ${decision.hash}, ${decision.createdAt}
          where not exists (
            select 1
            from drizzle.__drizzle_migrations
            where hash = ${decision.hash}
          )
        `;
        appliedTags.push(decision.tag);
      }
    }

    return {
      journalTablePresent: true,
      dryRun: options.dryRun ?? false,
      decisions,
      appliedTags,
    };
  } finally {
    await sql.end({ timeout: 5 });
  }
}
