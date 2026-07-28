import { describe, expect, it } from 'vitest';

import {
  assertMigrationJournalComplete,
  summarizeMigrationJournal,
  type ExpectedMigration,
} from './validate-migration-journal';

const EXPECTED: ExpectedMigration[] = [
  { tag: '0000_initial', hash: 'hash-0000' },
  { tag: '0001_next', hash: 'hash-0001' },
];

describe('summarizeMigrationJournal', () => {
  it('reports a complete migration journal', () => {
    expect(
      summarizeMigrationJournal(EXPECTED, ['hash-0000', 'hash-0001']),
    ).toEqual({
      expectedCount: 2,
      recordedCount: 2,
      missing: [],
      duplicateHashes: [],
      unknownHashes: [],
    });
  });

  it('reports missing, duplicate, and unknown hashes', () => {
    expect(
      summarizeMigrationJournal(EXPECTED, [
        'hash-0000',
        'hash-0000',
        'hash-deleted',
      ]),
    ).toEqual({
      expectedCount: 2,
      recordedCount: 3,
      missing: [{ tag: '0001_next', hash: 'hash-0001' }],
      duplicateHashes: ['hash-0000'],
      unknownHashes: ['hash-deleted'],
    });
  });
});

describe('assertMigrationJournalComplete', () => {
  it('throws when expected migrations are missing', () => {
    const summary = summarizeMigrationJournal(EXPECTED, ['hash-0000']);

    expect(() => assertMigrationJournalComplete(summary)).toThrow('0001_next');
  });
});
