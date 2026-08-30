import { z } from 'zod';

const shaSchema = z.string().regex(/^[0-9a-f]{40}$/i);
const branchSchema = z.string().min(1).max(255);
const previewUrlSchema = z
  .url()
  .refine((value) => new URL(value).protocol === 'https:', {
    message: 'Preview URL must use HTTPS.',
  });

export const canaryArgsSchema = z.object({
  branch: branchSchema,
  execute: z.boolean(),
  previewUrl: previewUrlSchema,
  sha: shaSchema,
});

export type CanaryArgs = z.infer<typeof canaryArgsSchema>;

export type DeploymentMetadata = {
  meta?: Record<string, unknown>;
  target?: string;
  url?: string;
};

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
  expected: { branch: string; owner: string; repository: string; sha: string },
): void {
  const meta = deployment.meta ?? {};
  if (
    deployment.target !== 'preview' ||
    meta.githubDeployment !== '1' ||
    meta.githubCommitRef !== expected.branch ||
    meta.githubCommitSha !== expected.sha ||
    meta.githubCommitOrg !== expected.owner ||
    meta.githubCommitRepo !== expected.repository
  ) {
    throw new Error(
      'Refusing deployment that is not this repository’s exact Preview branch and SHA.',
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
