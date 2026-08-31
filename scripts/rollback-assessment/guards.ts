import { z } from 'zod';

export const containmentFloorSha = '2450d410f4617f9b0e415f2b4d47bcde748b1cbc';

export const deploymentIdSchema = z.string().regex(/^dpl_[A-Za-z0-9]{1,64}$/);
export const gitShaSchema = z.string().regex(/^[0-9a-f]{40}$/i);
export const gitRefSchema = z
  .string()
  .min(1)
  .max(255)
  .refine(
    (value) =>
      !(
        value.startsWith('/') ||
        value.endsWith('/') ||
        value.endsWith('.') ||
        value.includes('..') ||
        value.includes('@{') ||
        /[\s\u0000-\u001f\u007f~^:?*\\[\\]/.test(value) ||
        value.split('/').some((part) => part.length === 0 || part === '.')
      ),
    'Git ref is malformed.',
  );

export type ProductionDeploymentDetail = {
  id?: unknown;
  meta?: unknown;
  ownerId?: unknown;
  projectId?: unknown;
  readyState?: unknown;
  target?: unknown;
  url?: unknown;
};

export type TrustedProductionCandidate = {
  deploymentId: string;
  gitRef: string;
  gitSha: string;
  immutableUrl: string;
};

export function parseRollbackAssessmentArgs(args: readonly string[]): {
  deploymentId: string;
} {
  const tokens = args.filter((arg, index) => !(index === 0 && arg === '--'));
  const values: string[] = [];
  let expectingValue = false;
  for (const arg of tokens) {
    if (expectingValue) {
      if (arg.startsWith('--')) {
        throw new Error('--deployment-id requires a value.');
      }
      values.push(arg);
      expectingValue = false;
      continue;
    }
    if (arg === '--deployment-id') {
      expectingValue = true;
      continue;
    }
    if (arg.startsWith('--deployment-id=')) {
      values.push(arg.slice('--deployment-id='.length));
      continue;
    }
    throw new Error('Rollback assessment accepts only one --deployment-id.');
  }
  if (expectingValue) throw new Error('--deployment-id requires a value.');
  if (values.length !== 1) {
    throw new Error(
      'Rollback assessment requires exactly one --deployment-id.',
    );
  }
  const parsed = deploymentIdSchema.safeParse(values[0]);
  if (!parsed.success)
    throw new Error('Rollback assessment deployment ID is malformed.');
  return { deploymentId: parsed.data };
}

function parseImmutableDeploymentUrl(value: unknown): string | undefined {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    /[\s\u0000-\u001f\u007f/:?#@]/.test(value)
  ) {
    return undefined;
  }
  try {
    const parsed = new URL(`https://${value}`);
    if (
      parsed.protocol !== 'https:' ||
      parsed.username !== '' ||
      parsed.password !== '' ||
      parsed.pathname !== '/' ||
      parsed.search !== '' ||
      parsed.hash !== ''
    ) {
      return undefined;
    }
    return parsed.origin;
  } catch {
    return undefined;
  }
}

export function assertProductionDeployment(
  detail: ProductionDeploymentDetail,
  expected: {
    orgId: string;
    owner: string;
    projectId: string;
    repository: string;
  },
  nominatedDeploymentId: string,
): TrustedProductionCandidate {
  const meta = detail.meta;
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
    throw new Error('Rollback candidate DETAIL metadata is invalid.');
  }
  const metadata = meta as Record<string, unknown>;
  const immutableUrl = parseImmutableDeploymentUrl(detail.url);
  const gitSha = metadata.githubCommitSha;
  const gitRef = metadata.githubCommitRef;
  if (
    detail.id !== nominatedDeploymentId ||
    detail.readyState !== 'READY' ||
    detail.target !== 'production' ||
    detail.ownerId !== expected.orgId ||
    detail.projectId !== expected.projectId ||
    metadata.githubDeployment !== '1' ||
    metadata.githubCommitOrg !== expected.owner ||
    metadata.githubCommitRepo !== expected.repository ||
    typeof gitSha !== 'string' ||
    typeof gitRef !== 'string' ||
    !gitShaSchema.safeParse(gitSha).success ||
    !gitRefSchema.safeParse(gitRef).success ||
    !immutableUrl
  ) {
    throw new Error(
      'Rollback candidate DETAIL does not satisfy production identity requirements.',
    );
  }
  return {
    deploymentId: nominatedDeploymentId,
    gitRef,
    gitSha,
    immutableUrl,
  };
}
