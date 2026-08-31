import { z } from 'zod';

export const gitShaSchema = z.string().regex(/^[0-9a-f]{40}$/i);
export const gitBranchSchema = z.string().min(1).max(255);
const previewUrlSchema = z.url().refine(
  (value) => {
    const parsed = new URL(value);
    return (
      parsed.protocol === 'https:' &&
      parsed.username === '' &&
      parsed.password === '' &&
      parsed.search === '' &&
      parsed.hash === ''
    );
  },
  {
    message:
      'Preview URL must be HTTPS without credentials, query, or fragment.',
  },
);

const explicitCanaryArgsSchema = z.object({
  branch: gitBranchSchema,
  debug: z.boolean(),
  execute: z.boolean(),
  mode: z.literal('explicit'),
  previewUrl: previewUrlSchema,
  sha: gitShaSchema,
});
const autoCanaryArgsSchema = z.object({
  debug: z.boolean(),
  execute: z.boolean(),
  mode: z.literal('auto'),
});

export const canaryArgsSchema = z.discriminatedUnion('mode', [
  explicitCanaryArgsSchema,
  autoCanaryArgsSchema,
]);

export type CanaryIdentityRequest =
  | {
      branch: string;
      mode: 'explicit';
      previewUrl: string;
      sha: string;
    }
  | { mode: 'auto' };
export type CanaryArgs = z.infer<typeof canaryArgsSchema>;

export type DeploymentMetadata = {
  meta?: Record<string, unknown>;
  ownerId?: string;
  projectId?: string;
  target?: string | null;
};

export type VercelProjectLink = { orgId: string; projectId: string };

export function parseCanaryArgs(args: string[]): CanaryArgs {
  const option = (name: string): string | undefined => {
    const prefix = `${name}=`;
    const values: string[] = [];
    let expectsSeparatedValue = false;
    for (const arg of args) {
      if (expectsSeparatedValue) {
        if (arg.startsWith('--')) throw new Error(`${name} requires a value.`);
        values.push(arg);
        expectsSeparatedValue = false;
      } else if (arg.startsWith(prefix)) {
        values.push(arg.slice(prefix.length));
      } else if (arg === name) {
        expectsSeparatedValue = true;
      }
    }
    if (expectsSeparatedValue) throw new Error(`${name} requires a value.`);
    if (values.length > 1)
      throw new Error(`${name} must not be specified twice.`);
    return values[0];
  };
  const flag = (name: '--auto' | '--debug' | '--execute'): boolean => {
    if (args.filter((arg) => arg === name).length > 1)
      throw new Error(`${name} must not be specified twice.`);
    return args.includes(name);
  };

  const auto = flag('--auto');
  const debug = flag('--debug');
  const execute = flag('--execute');
  const branch = option('--git-branch');
  const previewUrl = option('--preview-url');
  const sha = option('--git-sha');
  const hasExplicitIdentity =
    branch !== undefined || previewUrl !== undefined || sha !== undefined;

  if (auto) {
    if (hasExplicitIdentity) {
      throw new Error(
        '--auto cannot be combined with explicit identity options.',
      );
    }
    return canaryArgsSchema.parse({ debug, execute, mode: 'auto' });
  }
  if (branch === undefined || previewUrl === undefined || sha === undefined) {
    throw new Error(
      'Provide either --auto or complete --preview-url, --git-branch, and --git-sha options.',
    );
  }
  return canaryArgsSchema.parse({
    branch,
    debug,
    execute,
    mode: 'explicit',
    previewUrl,
    sha,
  });
}

export function assertExecute(args: CanaryArgs): void {
  if (!args.execute) {
    throw new Error('Refusing canary mutation without explicit --execute.');
  }
}

export function assertPreviewDeployment(
  deployment: DeploymentMetadata,
  expected: {
    branch: string;
    orgId: string;
    owner: string;
    projectId: string;
    repository: string;
    sha: string;
  },
): void {
  const meta = deployment.meta ?? {};
  if (
    deployment.target !== null ||
    meta.githubDeployment !== '1' ||
    meta.githubCommitRef !== expected.branch ||
    meta.githubCommitSha !== expected.sha ||
    meta.githubCommitOrg !== expected.owner ||
    meta.githubCommitRepo !== expected.repository ||
    deployment.projectId !== expected.projectId ||
    deployment.ownerId !== expected.orgId
  ) {
    throw new Error(
      'Refusing deployment that is not this repository’s exact Preview branch and SHA.',
    );
  }
}

export function assertVercelProjectLink(
  link: VercelProjectLink,
  expected: Pick<VercelProjectLink, 'orgId' | 'projectId'>,
): void {
  if (link.projectId !== expected.projectId || link.orgId !== expected.orgId) {
    throw new Error(
      'Vercel project link does not match the expected project and organization.',
    );
  }
}

export function assertExpectedNeonBranch(
  branchNames: readonly string[],
  gitBranch: string,
): void {
  if (!branchNames.includes(`preview/${gitBranch}`)) {
    throw new Error(
      'Refusing database mutation: expected Neon Preview branch is absent.',
    );
  }
}

export function assertClerkTestKeys(
  secretKey: string | undefined,
  publishableKey: string | undefined,
): void {
  if (
    !secretKey?.startsWith('sk_test_') ||
    !publishableKey?.startsWith('pk_test_')
  ) {
    throw new Error(
      'Refusing Clerk canary unless both configured keys are Clerk test keys.',
    );
  }
}

export function redactedEvidence(input: {
  branch: string;
  provider: string;
  previewUrl: string;
  sha: string;
}): Record<string, string> {
  return {
    branch: input.branch,
    previewUrl: input.previewUrl,
    provider: input.provider,
    sha: input.sha,
  };
}
