import { describe, expect, it } from 'vitest';

import { assessMigrationCompatibility } from './migration-compatibility';

const journal = [{ tag: '0000_rainy_lenny_balinger', hash: 'a'.repeat(64) }];

describe('rollback migration compatibility', () => {
  it('passes exact candidate and production journals', () => {
    expect(
      assessMigrationCompatibility({
        candidateMigrationJournal: journal,
        productionAppliedMigrationJournal: journal,
      }),
    ).toMatchObject({ status: 'PASS' });
  });

  it.each([
    ['length mismatch', [], journal],
    [
      'tag mismatch',
      [{ ...journal[0], tag: '0001_sunny_lenny_balinger' }],
      journal,
    ],
    ['hash mismatch', [{ ...journal[0], hash: 'b'.repeat(64) }], journal],
  ])(
    'blocks a %s',
    (_reason, candidateMigrationJournal, productionAppliedMigrationJournal) => {
      expect(
        assessMigrationCompatibility({
          candidateMigrationJournal,
          productionAppliedMigrationJournal,
        }),
      ).toMatchObject({ status: 'BLOCKED' });
    },
  );

  it.each([
    [{}],
    [
      {
        candidateMigrationJournal: [{ tag: 'bad', hash: 'bad' }],
        productionAppliedMigrationJournal: journal,
      },
    ],
  ])('does not pass missing or malformed evidence', (input) => {
    expect(assessMigrationCompatibility(input)).not.toMatchObject({
      status: 'PASS',
    });
  });
});
