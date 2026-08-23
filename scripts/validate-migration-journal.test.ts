import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  assertMigrationJournalComplete,
  resolveExpectedMigrations,
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

/**
 * `readMigrationSql` is a literal-path switch, not a dynamic
 * `readFile(join(dir, tag))` -- deliberately, per SEC-05/SEC-12. The cost of
 * that safety is that it has to be extended by hand for every new migration,
 * and forgetting is invisible locally: `pnpm test`, `pnpm test:db` and
 * `pnpm typecheck` all pass, and the first thing that notices is
 * `db:migrate:prod` during the Vercel build, which fails the deploy.
 *
 * That is exactly what happened with `0017_shiny_starbolt`. This test walks
 * the real journal so the omission fails here instead, one command into the
 * local loop.
 */
describe('readMigrationSql coverage of the real journal', () => {
  it('resolves every entry in _journal.json', async () => {
    await expect(resolveExpectedMigrations()).resolves.toBeInstanceOf(Array);
  });

  it('produces one hashed migration per journal entry', async () => {
    const journal = JSON.parse(
      await readFile(
        resolve(
          process.cwd(),
          'src/core/db/migrations/generated/meta/_journal.json',
        ),
        'utf8',
      ),
    ) as { entries: Array<{ tag: string }> };

    const resolved = await resolveExpectedMigrations();

    expect(resolved.map((m) => m.tag)).toEqual(
      journal.entries.map((e) => e.tag),
    );
    // A hash per entry, and no two identical -- an empty or mis-pointed file
    // would still "resolve" but would collide or hash to the empty digest.
    expect(new Set(resolved.map((m) => m.hash)).size).toBe(resolved.length);
  });
});
