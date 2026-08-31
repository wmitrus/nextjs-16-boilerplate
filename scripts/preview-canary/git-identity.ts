import { execFileSync } from 'node:child_process';

import { gitBranchSchema, gitShaSchema } from './guards';

type GitExecutor = (
  file: string,
  args: string[],
  options: Parameters<typeof execFileSync>[2],
) => string | Buffer;

export type LocalGitIdentity = { branch: string; sha: string };

export function resolveLocalGitIdentity(
  executor: GitExecutor = execFileSync,
): LocalGitIdentity {
  let branch: string;
  let sha: string;
  try {
    branch = executor('git', ['branch', '--show-current'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
      .toString()
      .trim();
    sha = executor('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
      .toString()
      .trim();
  } catch {
    throw new Error('Could not resolve local Git identity.');
  }

  if (
    !gitBranchSchema.safeParse(branch).success ||
    !gitShaSchema.safeParse(sha).success
  ) {
    throw new Error('Could not resolve a valid local Git identity.');
  }
  return { branch, sha };
}
