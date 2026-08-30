import { execFileSync } from 'node:child_process';
import path from 'node:path';

import { readTextFileWithinBase } from '../lib/fs-guards-shared';

import {
  assertClerkTestKeys,
  assertPreviewDeployment,
  parseCanaryArgs,
  redactedEvidence,
} from './guards';

type VercelDeployment = {
  id?: string;
  meta?: Record<string, unknown>;
  target?: string;
};

function requiredEnv(name: 'GITHUB_REPOSITORY' | 'VERCEL_TOKEN'): string {
  const value =
    name === 'GITHUB_REPOSITORY'
      ? process.env.GITHUB_REPOSITORY?.trim()
      : process.env.VERCEL_TOKEN?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function parseRepository(value: string): { owner: string; repository: string } {
  const [owner, repository, ...rest] = value.split('/');
  if (!owner || !repository || rest.length > 0) {
    throw new Error('GITHUB_REPOSITORY must use owner/repository.');
  }
  return { owner, repository };
}

function vercel(args: string[]): string {
  const cli = path.resolve(process.cwd(), 'node_modules/.bin/vercel');
  return execFileSync(
    cli,
    [...args, `--token=${requiredEnv('VERCEL_TOKEN')}`],
    {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
}

function readPreviewEnv(): Record<string, string> {
  const file = path.resolve(process.cwd(), '.vercel/.env.preview.local');
  const values: Record<string, string> = {};
  for (const line of readTextFileWithinBase(
    file,
    process.cwd(),
    'Vercel Preview environment file',
  ).split('\n')) {
    const separator = line.indexOf('=');
    if (separator < 1 || line.trimStart().startsWith('#')) continue;
    const key = line.slice(0, separator).trim();
    const value = line
      .slice(separator + 1)
      .trim()
      .replace(/^(['"])([\s\S]*)\1$/, '$2');
    switch (key) {
      case 'AUTH_PROVIDER':
        values.AUTH_PROVIDER = value;
        break;
      case 'CLERK_SECRET_KEY':
        values.CLERK_SECRET_KEY = value;
        break;
      case 'DATABASE_URL':
        values.DATABASE_URL = value;
        break;
      case 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY':
        values.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = value;
        break;
    }
  }
  return values;
}

function readPreviewValue(
  values: Record<string, string>,
  key:
    | 'AUTH_PROVIDER'
    | 'CLERK_SECRET_KEY'
    | 'DATABASE_URL'
    | 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
): string | undefined {
  switch (key) {
    case 'AUTH_PROVIDER':
      return values.AUTH_PROVIDER?.trim() || undefined;
    case 'CLERK_SECRET_KEY':
      return values.CLERK_SECRET_KEY?.trim() || undefined;
    case 'DATABASE_URL':
      return values.DATABASE_URL?.trim() || undefined;
    case 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY':
      return values.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() || undefined;
  }
}

export function run(argv = process.argv): void {
  const args = parseCanaryArgs(argv.slice(2));
  const inspected = JSON.parse(
    vercel(['inspect', args.previewUrl, '--json']),
  ) as VercelDeployment;
  if (!inspected.id)
    throw new Error('Vercel inspect did not return a deployment ID.');
  const deployment = JSON.parse(
    vercel([
      'api',
      `/v13/deployments/${encodeURIComponent(inspected.id)}`,
      '--raw',
    ]),
  ) as VercelDeployment;
  const repository = parseRepository(requiredEnv('GITHUB_REPOSITORY'));
  assertPreviewDeployment(deployment, {
    ...repository,
    branch: args.branch,
    sha: args.sha,
  });

  vercel([
    'pull',
    '--yes',
    '--environment=preview',
    `--git-branch=${args.branch}`,
  ]);
  const previewEnv = readPreviewEnv();
  const provider = readPreviewValue(previewEnv, 'AUTH_PROVIDER');
  const databaseUrl = readPreviewValue(previewEnv, 'DATABASE_URL');
  if (!provider || !databaseUrl) {
    throw new Error(
      'Preview environment must define AUTH_PROVIDER and DATABASE_URL.',
    );
  }
  if (provider !== 'authjs' && provider !== 'clerk') {
    throw new Error('Preview AUTH_PROVIDER is not supported by the canary.');
  }
  if (provider === 'clerk') {
    assertClerkTestKeys(
      readPreviewValue(previewEnv, 'CLERK_SECRET_KEY'),
      readPreviewValue(previewEnv, 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY'),
    );
  }

  execFileSync(
    'pnpm',
    ['neon', '--', 'verify-preview-endpoint', `--git-branch=${args.branch}`],
    {
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  console.log(
    JSON.stringify({
      ...redactedEvidence({ ...args, provider }),
      mode: 'read-only',
      mutation: args.execute
        ? 'refused: A3b owns fixture mutation'
        : 'not requested',
      neonPreviewBranch: `preview/${args.branch}`,
    }),
  );
}

const isMain = process.argv[1]?.endsWith('/scripts/preview-canary/cli.ts');
if (isMain) {
  try {
    run();
  } catch (error: unknown) {
    console.error(
      `[preview-canary] ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}
