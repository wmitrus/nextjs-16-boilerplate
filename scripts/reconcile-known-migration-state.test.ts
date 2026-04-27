import { describe, expect, it } from 'vitest';

import {
  evaluateReconciliationDecision,
  type MigrationArtifactInspection,
  type ResolvedKnownMigration,
} from './reconcile-known-migration-state';

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
