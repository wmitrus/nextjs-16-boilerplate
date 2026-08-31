import { describe, expect, it } from 'vitest';

import { assessMigrationCompatibility } from './migration-compatibility';

const journal = [{ tag: '0000_rainy_lenny_balinger', hash: 'a'.repeat(64) }];

describe('rollback migration compatibility', () => {
  it('passes only exact candidate and production journals', () => {
    expect(
      assessMigrationCompatibility({
        candidateMigrationJournal: journal,
        productionAppliedMigrationJournal: journal,
      }),
    ).toMatchObject({ status: 'PASS' });
  });

  it.each([
    [
      {
        candidateMigrationJournal: [],
        productionAppliedMigrationJournal: journal,
      },
    ],
    [
      {
        candidateMigrationJournal: journal,
        productionAppliedMigrationJournal: [],
      },
    ],
    [{}],
    [
      {
        candidateMigrationJournal: [{ tag: 'bad', hash: 'bad' }],
        productionAppliedMigrationJournal: journal,
      },
    ],
  ])('blocks missing, different, or malformed evidence', (input) => {
    expect(assessMigrationCompatibility(input)).not.toMatchObject({
      status: 'PASS',
    });
  });
});
