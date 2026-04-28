import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  evaluateReconciliationDecision,
  reconcileKnownMigrationState,
  type MigrationArtifactInspection,
  type ResolvedKnownMigration,
} from './reconcile-known-migration-state';

const postgresState = vi.hoisted(() => ({
  begin: vi.fn(),
  end: vi.fn(),
  queryHandler: vi.fn(),
}));

vi.mock('postgres', () => ({
  default: vi.fn(() => {
    const sql = async (strings: TemplateStringsArray, ...values: unknown[]) =>
      postgresState.queryHandler(strings, values);
    return Object.assign(sql, {
      begin: postgresState.begin,
      end: postgresState.end,
    });
  }),
}));

const PASSWORD_RESET_MIGRATION: ResolvedKnownMigration = {
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
  hash: 'test-hash',
  createdAt: 1776770000000,
};

function buildInspection(
  overrides: Partial<MigrationArtifactInspection> = {},
): MigrationArtifactInspection {
  return {
    tableExists: true,
    columns: [...PASSWORD_RESET_MIGRATION.requiredColumns],
    indexes: [...PASSWORD_RESET_MIGRATION.requiredIndexes],
    constraints: [...PASSWORD_RESET_MIGRATION.requiredConstraints],
    ...overrides,
  };
}

describe('evaluateReconciliationDecision', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('marks the migration as already recorded when the hash exists', () => {
    expect(
      evaluateReconciliationDecision(
        PASSWORD_RESET_MIGRATION,
        true,
        buildInspection(),
      ),
    ).toEqual({
      tag: '0010_password_reset_tokens',
      action: 'already-recorded',
      reason: 'hash-present',
    });
  });

  it('plans a backfill when the schema is already present but the hash is missing', () => {
    expect(
      evaluateReconciliationDecision(
        PASSWORD_RESET_MIGRATION,
        false,
        buildInspection(),
      ),
    ).toEqual({
      tag: '0010_password_reset_tokens',
      action: 'backfill',
      reason: 'schema-already-present',
      hash: 'test-hash',
      createdAt: 1776770000000,
    });
  });

  it('skips backfill when the table is missing entirely', () => {
    expect(
      evaluateReconciliationDecision(
        PASSWORD_RESET_MIGRATION,
        false,
        buildInspection({
          tableExists: false,
          columns: [],
          indexes: [],
          constraints: [],
        }),
      ),
    ).toEqual({
      tag: '0010_password_reset_tokens',
      action: 'skip',
      reason: 'table-missing',
      missingColumns: PASSWORD_RESET_MIGRATION.requiredColumns,
      missingIndexes: PASSWORD_RESET_MIGRATION.requiredIndexes,
      missingConstraints: PASSWORD_RESET_MIGRATION.requiredConstraints,
    });
  });

  it('skips backfill when the schema is incomplete', () => {
    expect(
      evaluateReconciliationDecision(
        PASSWORD_RESET_MIGRATION,
        false,
        buildInspection({
          indexes: ['idx_password_reset_tokens_user'],
          constraints: [
            'password_reset_tokens_pkey',
            'password_reset_tokens_token_hash_unique',
          ],
        }),
      ),
    ).toEqual({
      tag: '0010_password_reset_tokens',
      action: 'skip',
      reason: 'schema-incomplete',
      missingColumns: [],
      missingIndexes: ['idx_password_reset_tokens_hash'],
      missingConstraints: ['password_reset_tokens_user_id_users_id_fk'],
    });
  });
});

describe('reconcileKnownMigrationState', () => {
  it('checks and inserts backfills inside a SERIALIZABLE transaction', async () => {
    const migrationHash = '4de8f5400bb4ac20b190645ee5512334';
    const beginCalls: string[] = [];
    const txUnsafe = vi.fn(async (query: string) => {
      const text = query;
      if (text.includes('from drizzle.__drizzle_migrations')) {
        return [];
      }
      if (text.includes('insert into drizzle.__drizzle_migrations')) {
        return [{ hash: migrationHash }];
      }
      return [];
    });

    postgresState.queryHandler.mockImplementation(
      async (strings: TemplateStringsArray) => {
        const text = strings.join(' ');
        if (
          text.includes("select to_regclass('drizzle.__drizzle_migrations')")
        ) {
          return [{ name: 'drizzle.__drizzle_migrations' }];
        }
        if (text.includes('select hash')) {
          return [];
        }
        if (text.includes('information_schema.columns')) {
          return [
            { column_name: 'id' },
            { column_name: 'user_id' },
            { column_name: 'token_hash' },
            { column_name: 'expires_at' },
            { column_name: 'used_at' },
            { column_name: 'created_at' },
          ];
        }
        if (text.includes('pg_indexes')) {
          return [
            { indexname: 'idx_password_reset_tokens_user' },
            { indexname: 'idx_password_reset_tokens_hash' },
          ];
        }
        if (text.includes('pg_constraint')) {
          return [
            { conname: 'password_reset_tokens_pkey' },
            { conname: 'password_reset_tokens_token_hash_unique' },
            { conname: 'password_reset_tokens_user_id_users_id_fk' },
          ];
        }
        if (text.includes('information_schema.tables')) {
          return [{ exists: true }];
        }
        if (text.includes('email_verification_tokens')) {
          return [];
        }
        return [];
      },
    );

    postgresState.begin.mockImplementation(
      async (
        isolationLevel: string,
        callback: (tx: { unsafe: typeof txUnsafe }) => Promise<void>,
      ) => {
        beginCalls.push(isolationLevel);
        await callback({ unsafe: txUnsafe });
      },
    );
    postgresState.end.mockResolvedValue(undefined);

    const summary = await reconcileKnownMigrationState({
      connectionString: 'postgres://example',
    });

    expect(beginCalls).toEqual(['SERIALIZABLE']);
    expect(txUnsafe).toHaveBeenCalledTimes(2);
    expect(summary.appliedTags).toEqual(['0010_password_reset_tokens']);
  });
});
