import { execFileSync } from 'node:child_process';
import path from 'node:path';

import { readTextFileWithinBase } from '../lib/fs-guards-shared';

import type { ProductionDeploymentDetail } from './guards';
import { deploymentIdSchema } from './guards';

const VERCEL_DETAIL_MAX_BUFFER_BYTES = 128 * 1024;
const VERCEL_DETAIL_TIMEOUT_MS = 15_000;

export interface ExpectedProductionIdentity {
  orgId: string;
  owner: string;
  projectId: string;
  repository: string;
}

type VercelExecutor = typeof execFileSync;

function requiredEnv(
  name:
    | 'GITHUB_REPOSITORY'
    | 'VERCEL_ORG_ID'
    | 'VERCEL_PROJECT_ID'
    | 'VERCEL_TOKEN',
): string {
  const value =
    name === 'GITHUB_REPOSITORY'
      ? process.env.GITHUB_REPOSITORY?.trim()
      : name === 'VERCEL_ORG_ID'
        ? process.env.VERCEL_ORG_ID?.trim()
        : name === 'VERCEL_PROJECT_ID'
          ? process.env.VERCEL_PROJECT_ID?.trim()
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

function readLocalVercelProjectLink(): { orgId: string; projectId: string } {
  const file = path.resolve(process.cwd(), '.vercel/project.json');
  let parsed: unknown;
  try {
    parsed = JSON.parse(
      readTextFileWithinBase(file, process.cwd(), 'Vercel project link'),
    );
  } catch {
    throw new Error('Vercel project link is missing or malformed.');
  }
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    Array.isArray(parsed) ||
    !('orgId' in parsed) ||
    !('projectId' in parsed) ||
    typeof parsed.orgId !== 'string' ||
    typeof parsed.projectId !== 'string'
  ) {
    throw new Error('Vercel project link is missing or malformed.');
  }
  return { orgId: parsed.orgId, projectId: parsed.projectId };
}

export function readExpectedProductionIdentity(
  readProjectLink = readLocalVercelProjectLink,
): ExpectedProductionIdentity {
  const expected = {
    ...parseRepository(requiredEnv('GITHUB_REPOSITORY')),
    orgId: requiredEnv('VERCEL_ORG_ID'),
    projectId: requiredEnv('VERCEL_PROJECT_ID'),
  };
  const projectLink = readProjectLink();
  if (
    projectLink.orgId !== expected.orgId ||
    projectLink.projectId !== expected.projectId
  ) {
    throw new Error(
      'Vercel project link does not match the expected project and organization.',
    );
  }
  return expected;
}

export function readRemoteCandidateDetail(
  deploymentId: string,
  executor: VercelExecutor = execFileSync,
): ProductionDeploymentDetail {
  if (!deploymentIdSchema.safeParse(deploymentId).success) {
    throw new Error('Rollback assessment deployment ID is malformed.');
  }
  const cli = path.resolve(process.cwd(), 'node_modules/.bin/vercel');
  const token = requiredEnv('VERCEL_TOKEN');
  let output: string;
  try {
    output = executor(
      cli,
      [
        'api',
        `/v13/deployments/${encodeURIComponent(deploymentId)}`,
        '--method=GET',
        '--raw',
        `--token=${token}`,
      ],
      {
        encoding: 'utf8',
        maxBuffer: VERCEL_DETAIL_MAX_BUFFER_BYTES,
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: VERCEL_DETAIL_TIMEOUT_MS,
      },
    ).toString();
  } catch {
    throw new Error('Remote candidate DETAIL request failed.');
  }
  if (Buffer.byteLength(output, 'utf8') > VERCEL_DETAIL_MAX_BUFFER_BYTES) {
    throw new Error('Remote candidate DETAIL response is too large.');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
  } catch {
    throw new Error('Remote candidate DETAIL returned malformed data.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Remote candidate DETAIL returned malformed data.');
  }
  return parsed as ProductionDeploymentDetail;
}
