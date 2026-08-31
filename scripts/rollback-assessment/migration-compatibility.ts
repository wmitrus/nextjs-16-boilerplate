import { z } from 'zod';

import { gate, type AssessmentGate } from './evidence';

const migrationSchema = z.object({
  hash: z.string().regex(/^[a-f0-9]{64}$/),
  tag: z.string().regex(/^\d{4}_[a-z0-9_]+$/),
});
const journalSchema = z
  .array(migrationSchema)
  .superRefine((entries, context) => {
    const tags = new Set<string>();
    const hashes = new Set<string>();
    for (const [index, entry] of entries.entries()) {
      if (tags.has(entry.tag) || hashes.has(entry.hash)) {
        context.addIssue({
          code: 'custom',
          message: 'Migration journal contains duplicates.',
          path: [index],
        });
      }
      tags.add(entry.tag);
      hashes.add(entry.hash);
    }
  });

export type MigrationJournalEvidence = z.infer<typeof journalSchema>;

export function assessMigrationCompatibility(input: {
  candidateMigrationJournal?: unknown;
  productionAppliedMigrationJournal?: unknown;
}): AssessmentGate {
  if (
    input.candidateMigrationJournal === undefined ||
    input.productionAppliedMigrationJournal === undefined
  ) {
    return gate(
      'BLOCKED',
      'Candidate and production migration-journal evidence is required.',
    );
  }
  const candidate = journalSchema.safeParse(input.candidateMigrationJournal);
  const production = journalSchema.safeParse(
    input.productionAppliedMigrationJournal,
  );
  if (!candidate.success || !production.success) {
    return gate('INVALID', 'Migration-journal evidence is malformed.');
  }
  if (candidate.data.length !== production.data.length) {
    return gate(
      'BLOCKED',
      'Candidate migration journal does not exactly match production evidence.',
    );
  }
  for (const [index, entry] of candidate.data.entries()) {
    const productionEntry = production.data.at(index);
    if (
      !productionEntry ||
      entry.tag !== productionEntry.tag ||
      entry.hash !== productionEntry.hash
    ) {
      return gate(
        'BLOCKED',
        'Candidate migration journal does not exactly match production evidence.',
      );
    }
  }
  return gate(
    'PASS',
    'Candidate and production migration journals exactly match.',
  );
}
