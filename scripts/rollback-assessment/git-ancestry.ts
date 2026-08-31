import { execFileSync } from 'node:child_process';

import { gate, type AssessmentGate } from './evidence';
import { containmentFloorSha, gitShaSchema } from './guards';

type GitExecutor = (
  ...parameters: Parameters<typeof execFileSync>
) => string | Buffer;

const options: NonNullable<Parameters<typeof execFileSync>[2]> = {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
};

export function assessContainmentFloorAncestry(
  candidateSha: string,
  executor: GitExecutor = execFileSync,
): AssessmentGate {
  if (!gitShaSchema.safeParse(candidateSha).success) {
    return gate('INVALID', 'Candidate Git SHA is malformed.');
  }
  let shallow: string;
  try {
    shallow = executor('git', ['rev-parse', '--is-shallow-repository'], options)
      .toString()
      .trim();
  } catch {
    return gate(
      'ERROR',
      'Could not determine whether local Git history is shallow.',
    );
  }
  if (shallow === 'true') {
    return gate(
      'BLOCKED',
      'Local Git history is shallow; ancestry cannot be proven locally.',
    );
  }
  if (shallow !== 'false') {
    return gate('ERROR', 'Local Git shallow-history state is invalid.');
  }
  try {
    executor(
      'git',
      ['merge-base', '--is-ancestor', containmentFloorSha, candidateSha],
      options,
    );
    return gate(
      'PASS',
      'Candidate commit descends from the containment floor.',
    );
  } catch (error: unknown) {
    const status =
      typeof error === 'object' && error !== null && 'status' in error
        ? error.status
        : undefined;
    if (status === 1) {
      return gate(
        'BLOCKED',
        'Candidate commit does not descend from the containment floor.',
      );
    }
    return gate('ERROR', 'Could not prove containment-floor ancestry locally.');
  }
}
