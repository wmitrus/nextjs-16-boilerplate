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
  // A. Exact journal -> no throw.
  it('does not throw for an exact expected journal', () => {
    const summary = summarizeMigrationJournal(EXPECTED, [
      'hash-0000',
      'hash-0001',
    ]);

    expect(() => assertMigrationJournalComplete(summary)).not.toThrow();
  });

  // B. Missing only -> throw (identifies the "missing" category and tag).
  it('throws when expected migrations are missing', () => {
    const summary = summarizeMigrationJournal(EXPECTED, ['hash-0000']);

    expect(() => assertMigrationJournalComplete(summary)).toThrow('0001_next');
    expect(() => assertMigrationJournalComplete(summary)).toThrow('missing:');
  });

  // C. Duplicate only, every expected migration otherwise present -> throw.
  // Regression for the exact OZI-78 Production gap: a full-but-duplicated
  // journal previously passed.
  it('throws on duplicate journal rows even when every expected migration is present', () => {
    const summary = summarizeMigrationJournal(EXPECTED, [
      'hash-0000',
      'hash-0001',
      'hash-0000',
    ]);

    expect(summary.missing).toEqual([]);
    expect(summary.duplicateHashes).toEqual(['hash-0000']);
    expect(() => assertMigrationJournalComplete(summary)).toThrow('duplicate:');
  });

  // D. Unknown only, every expected migration otherwise present -> throw.
  // Regression for retired/historical hashes left in the journal.
  it('throws on unknown/historical journal hashes even when every expected migration is present', () => {
    const summary = summarizeMigrationJournal(EXPECTED, [
      'hash-0000',
      'hash-0001',
      'hash-retired',
    ]);

    expect(summary.missing).toEqual([]);
    expect(summary.unknownHashes).toEqual(['hash-retired']);
    expect(() => assertMigrationJournalComplete(summary)).toThrow('unknown:');
  });

  // E. Duplicate + unknown together -> throw, naming both categories.
  it('throws and names every violated category when duplicate and unknown drift coexist', () => {
    const summary = summarizeMigrationJournal(EXPECTED, [
      'hash-0000',
      'hash-0000',
      'hash-0001',
      'hash-retired',
    ]);

    expect(summary.missing).toEqual([]);
    let message = '';
    try {
      assertMigrationJournalComplete(summary);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toContain('duplicate:');
    expect(message).toContain('unknown:');
    expect(message).not.toMatch(/postgres:|DATABASE_URL|password/i);
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
