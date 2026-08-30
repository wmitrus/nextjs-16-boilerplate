import { z } from 'zod';

const shaSchema = z.string().regex(/^[0-9a-f]{40}$/i);
const branchSchema = z.string().min(1).max(255);
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

export const canaryArgsSchema = z.object({
  branch: branchSchema,
  execute: z.boolean(),
  previewUrl: previewUrlSchema,
  sha: shaSchema,
});

export type CanaryArgs = z.infer<typeof canaryArgsSchema>;

export type DeploymentMetadata = {
  meta?: Record<string, unknown>;
  ownerId?: string;
  projectId?: string;
  target?: string;
};

export type VercelProjectLink = { orgId: string; projectId: string };

export function parseCanaryArgs(args: string[]): CanaryArgs {
  const option = (name: string): string | undefined => {
    const inline = args.find((value) => value.startsWith(`${name}=`));
    if (inline) return inline.slice(name.length + 1);
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : undefined;
  };

  return canaryArgsSchema.parse({
    branch: option('--git-branch'),
    execute: args.includes('--execute'),
    previewUrl: option('--preview-url'),
    sha: option('--git-sha'),
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
    deployment.target !== 'preview' ||
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
