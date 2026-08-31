import { execFileSync } from 'node:child_process';
import path from 'node:path';

import { readTextFileWithinBase } from '../lib/fs-guards-shared';

import { resolveLocalGitIdentity } from './git-identity';
import {
  assertClerkTestKeys,
  assertPreviewDeployment,
  assertVercelProjectLink,
  parseCanaryArgs,
  redactedEvidence,
  type CanaryArgs,
} from './guards';

const RUNTIME_PROBE_TIMEOUT_MS = 10_000;

type VercelDeployment = {
  id?: string;
  meta?: Record<string, unknown>;
  ownerId?: string;
  projectId?: string;
  readyState?: string;
  target?: string | null;
  url?: string;
};

type VercelListCandidate = {
  deploymentId?: string;
  identifierField?: 'id' | 'uid';
  identifierFieldsPresent: string[];
  deployment: VercelDeployment;
};

export type CanaryIdentity = {
  branch: string;
  previewUrl: string;
  sha: string;
};

function requiredEnv(
  name:
    | 'GITHUB_REPOSITORY'
    | 'VERCEL_ORG_ID'
    | 'VERCEL_PROJECT_ID'
    | 'VERCEL_TOKEN'
    | 'VERCEL_AUTOMATION_BYPASS_SECRET',
): string {
  const value =
    name === 'GITHUB_REPOSITORY'
      ? process.env.GITHUB_REPOSITORY?.trim()
      : name === 'VERCEL_ORG_ID'
        ? process.env.VERCEL_ORG_ID?.trim()
        : name === 'VERCEL_PROJECT_ID'
          ? process.env.VERCEL_PROJECT_ID?.trim()
          : name === 'VERCEL_TOKEN'
            ? process.env.VERCEL_TOKEN?.trim()
            : process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();
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

type VercelExecutor = (
  file: string,
  args: string[],
  options: Parameters<typeof execFileSync>[2],
) => string | Buffer;

export function runVercelOperation(
  operation:
    | 'deployment discovery'
    | 'inspect'
    | 'deployment metadata'
    | 'pull',
  args: string[],
  executor: VercelExecutor = execFileSync,
): string {
  const cli = path.resolve(process.cwd(), 'node_modules/.bin/vercel');
  const token = requiredEnv('VERCEL_TOKEN');
  try {
    const output = executor(cli, [...args, `--token=${token}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return output.toString();
  } catch (error: unknown) {
    const exitCode =
      typeof error === 'object' &&
      error !== null &&
      'status' in error &&
      typeof error.status === 'number'
        ? ` (exit code ${error.status})`
        : '';
    throw new Error(`Vercel ${operation} failed${exitCode}.`);
  }
}

function normalizeVercelDeployment(value: unknown): VercelDeployment {
  if (!value || typeof value !== 'object') return {};
  const candidate = value as Record<string, unknown>;
  return {
    ...(typeof candidate.id === 'string' ? { id: candidate.id } : {}),
    ...(candidate.meta && typeof candidate.meta === 'object'
      ? { meta: candidate.meta as Record<string, unknown> }
      : {}),
    ...(typeof candidate.ownerId === 'string'
      ? { ownerId: candidate.ownerId }
      : {}),
    ...(typeof candidate.projectId === 'string'
      ? { projectId: candidate.projectId }
      : {}),
    ...(typeof candidate.readyState === 'string'
      ? { readyState: candidate.readyState }
      : {}),
    ...(typeof candidate.target === 'string' || candidate.target === null
      ? { target: candidate.target }
      : {}),
    ...(typeof candidate.url === 'string' ? { url: candidate.url } : {}),
  };
}

function parseVercelDeploymentPage(output: string): {
  candidates: VercelListCandidate[];
  next?: number;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
  } catch {
    throw new Error('Vercel deployment discovery returned malformed data.');
  }
  const candidates = Array.isArray(parsed)
    ? parsed
    : parsed &&
        typeof parsed === 'object' &&
        'deployments' in parsed &&
        Array.isArray(parsed.deployments)
      ? parsed.deployments
      : undefined;
  if (!candidates) {
    throw new Error('Vercel deployment discovery returned malformed data.');
  }
  const next =
    parsed &&
    typeof parsed === 'object' &&
    !Array.isArray(parsed) &&
    'pagination' in parsed &&
    parsed.pagination &&
    typeof parsed.pagination === 'object' &&
    'next' in parsed.pagination &&
    typeof parsed.pagination.next === 'number' &&
    parsed.pagination.next > 0
      ? parsed.pagination.next
      : undefined;
  return {
    candidates: candidates.map((candidate): VercelListCandidate => {
      const record =
        candidate && typeof candidate === 'object'
          ? (candidate as Record<string, unknown>)
          : {};
      const identifierFieldsPresent = [
        ...(typeof record.uid === 'string' ? ['uid'] : []),
        ...(typeof record.id === 'string' ? ['id'] : []),
      ];
      const identifierField =
        typeof record.uid === 'string'
          ? 'uid'
          : typeof record.id === 'string'
            ? 'id'
            : undefined;
      const deploymentId =
        identifierField === 'uid'
          ? typeof record.uid === 'string'
            ? record.uid
            : undefined
          : identifierField === 'id'
            ? typeof record.id === 'string'
              ? record.id
              : undefined
            : undefined;
      return {
        deployment: normalizeVercelDeployment(candidate),
        deploymentId,
        identifierField,
        identifierFieldsPresent,
      };
    }),
    next,
  };
}

type DebugCheck = 'fail' | 'pass';

function debugLog(enabled: boolean, event: string, value: object): void {
  if (enabled) console.log(`[preview-canary:debug] ${event}`, value);
}

function safeCandidate(candidate: VercelDeployment): Record<string, unknown> {
  const meta = candidate.meta ?? {};
  let deploymentUrl: string | null = null;
  try {
    deploymentUrl = parseImmutableDeploymentUrl(candidate);
  } catch {
    deploymentUrl = '[invalid]';
  }
  return {
    id: candidate.id ?? '[missing]',
    meta: {
      githubCommitOrg:
        typeof meta.githubCommitOrg === 'string' ? meta.githubCommitOrg : null,
      githubCommitRef:
        typeof meta.githubCommitRef === 'string' ? meta.githubCommitRef : null,
      githubCommitRepo:
        typeof meta.githubCommitRepo === 'string'
          ? meta.githubCommitRepo
          : null,
      githubCommitSha:
        typeof meta.githubCommitSha === 'string' ? meta.githubCommitSha : null,
      githubDeployment:
        typeof meta.githubDeployment === 'string'
          ? meta.githubDeployment
          : null,
    },
    ownerId: candidate.ownerId ?? '[missing]',
    projectId: candidate.projectId ?? '[missing]',
    readyState: candidate.readyState ?? '[missing]',
    target: candidate.target === undefined ? '[missing]' : candidate.target,
    url: deploymentUrl,
  };
}

function safeListCandidate(
  candidate: VercelListCandidate,
): Record<string, unknown> {
  return {
    deploymentId: candidate.deploymentId ?? '[missing]',
    identifierField: candidate.identifierField ?? '[missing]',
    identifierFieldsPresent: candidate.identifierFieldsPresent,
    ...safeCandidate(candidate.deployment),
  };
}

function isProviderDeploymentIdentifier(
  value: string | undefined,
): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,256}$/.test(value);
}

function evaluateCandidate(
  candidate: VercelDeployment,
  expected: {
    branch: string;
    orgId: string;
    owner: string;
    projectId: string;
    repository: string;
    sha: string;
  },
): {
  checks: Record<string, DebugCheck>;
  reasons: string[];
  valid: boolean;
} {
  const meta = candidate.meta ?? {};
  let immutableUrlValid = true;
  try {
    parseImmutableDeploymentUrl(candidate);
  } catch {
    immutableUrlValid = false;
  }
  const checks = {
    gitBranch: meta.githubCommitRef === expected.branch ? 'pass' : 'fail',
    gitOwner: meta.githubCommitOrg === expected.owner ? 'pass' : 'fail',
    gitRepo: meta.githubCommitRepo === expected.repository ? 'pass' : 'fail',
    gitSha: meta.githubCommitSha === expected.sha ? 'pass' : 'fail',
    githubDeployment: meta.githubDeployment === '1' ? 'pass' : 'fail',
    immutableUrl: immutableUrlValid ? 'pass' : 'fail',
    owner: candidate.ownerId === expected.orgId ? 'pass' : 'fail',
    previewTarget: candidate.target === null ? 'pass' : 'fail',
    project: candidate.projectId === expected.projectId ? 'pass' : 'fail',
    ready: candidate.readyState === 'READY' ? 'pass' : 'fail',
  } satisfies Record<string, DebugCheck>;
  const reasons: string[] = [
    ...(checks.ready === 'fail' ? ['deployment is not READY'] : []),
    ...(checks.previewTarget === 'fail' ? ['target is not Preview'] : []),
    ...(checks.project === 'fail' ? ['Vercel project mismatch'] : []),
    ...(checks.owner === 'fail' ? ['Vercel organization mismatch'] : []),
    ...(checks.githubDeployment === 'fail'
      ? ['githubDeployment marker mismatch']
      : []),
    ...(checks.gitBranch === 'fail' ? ['git branch mismatch'] : []),
    ...(checks.gitSha === 'fail' ? ['git SHA mismatch'] : []),
    ...(checks.gitOwner === 'fail' ? ['GitHub owner mismatch'] : []),
    ...(checks.gitRepo === 'fail' ? ['GitHub repository mismatch'] : []),
    ...(checks.immutableUrl === 'fail'
      ? ['immutable deployment URL invalid']
      : []),
  ];
  let valid = reasons.length === 0;
  if (valid) {
    try {
      assertPreviewDeployment(candidate, expected);
    } catch {
      valid = false;
      reasons.push('deployment identity validation failed');
    }
  }
  return { checks, reasons, valid };
}

export function resolveAutoPreviewIdentity(
  identity: { branch: string; sha: string },
  executor: VercelExecutor = execFileSync,
  debug = false,
): { branch: string; previewUrl: string; sha: string } {
  const repository = parseRepository(requiredEnv('GITHUB_REPOSITORY'));
  const vercelIdentity = {
    orgId: requiredEnv('VERCEL_ORG_ID'),
    projectId: requiredEnv('VERCEL_PROJECT_ID'),
  };
  const expected = { ...repository, ...vercelIdentity, ...identity };
  const candidates: VercelListCandidate[] = [];
  const seenPages = new Set<number>();
  let next: number | undefined;
  let pagesFetched = 0;
  do {
    const query = new URLSearchParams({
      'meta-githubCommitRef': identity.branch,
      'meta-githubCommitSha': identity.sha,
      limit: '100',
      projectId: vercelIdentity.projectId,
      state: 'READY',
      teamId: vercelIdentity.orgId,
    });
    if (next !== undefined) query.set('until', String(next));
    const page = parseVercelDeploymentPage(
      runVercelOperation(
        'deployment discovery',
        ['api', `/v6/deployments?${query.toString()}`, '--method=GET', '--raw'],
        executor,
      ),
    );
    pagesFetched += 1;
    candidates.push(...page.candidates);
    next = page.next;
    if (next !== undefined && (seenPages.has(next) || seenPages.size >= 100)) {
      throw new Error('Vercel deployment discovery returned malformed data.');
    }
    if (next !== undefined) seenPages.add(next);
  } while (next !== undefined);

  let detailResponsesFetched = 0;
  const matches: Array<{ deployment: VercelDeployment; id: string }> = [];
  let malformedListIdentifier = false;
  for (const candidate of candidates) {
    if (!isProviderDeploymentIdentifier(candidate.deploymentId)) {
      malformedListIdentifier = true;
      debugLog(debug, 'candidate', {
        ...safeListCandidate(candidate),
        detailFetched: false,
        detailMetadataValidated: false,
        listDiscovered: true,
        reasons: ['deployment identifier missing or malformed'],
        result: 'rejected',
      });
      continue;
    }

    let detail: VercelDeployment;
    try {
      detail = normalizeVercelDeployment(
        JSON.parse(
          runVercelOperation(
            'deployment metadata',
            [
              'api',
              `/v13/deployments/${encodeURIComponent(candidate.deploymentId)}`,
              '--method=GET',
              '--raw',
            ],
            executor,
          ),
        ),
      );
      detailResponsesFetched += 1;
    } catch {
      debugLog(debug, 'candidate', {
        ...safeListCandidate(candidate),
        detailFetched: false,
        detailMetadataValidated: false,
        listDiscovered: true,
        reasons: ['deployment detail could not be read'],
        result: 'rejected',
      });
      continue;
    }
    const evaluation = evaluateCandidate(detail, expected);
    debugLog(debug, 'candidate', {
      ...safeListCandidate(candidate),
      checks: evaluation.checks,
      detailFetched: true,
      detailMetadata: safeCandidate(detail),
      detailMetadataValidated: evaluation.valid,
      listDiscovered: true,
      reasons: evaluation.reasons,
      result: evaluation.valid ? 'accepted' : 'rejected',
    });
    if (evaluation.valid) {
      matches.push({ deployment: detail, id: candidate.deploymentId });
    }
  }
  debugLog(debug, 'discovery summary', {
    candidateIdsDiscovered: new Set(
      candidates
        .map((candidate) => candidate.deploymentId)
        .filter(isProviderDeploymentIdentifier),
    ).size,
    deploymentListEntriesExamined: candidates.length,
    detailResponsesFetched,
    fullyValidCandidates: matches.length,
    pagesFetched,
  });
  if (malformedListIdentifier) {
    throw new Error('Vercel deployment discovery returned malformed data.');
  }
  if (matches.length === 0) {
    throw new Error(
      'No exact READY Preview deployment found for current branch and SHA.',
    );
  }
  if (matches.length > 1) {
    throw new Error(
      'Multiple exact READY Preview deployments found for current branch and SHA.',
    );
  }
  const selected = matches[0];
  if (!selected) {
    throw new Error('Vercel deployment discovery returned malformed data.');
  }
  const previewUrl = parseImmutableDeploymentUrl(selected.deployment);
  debugLog(debug, 'discovery selected', {
    id: selected.id,
    immutableUrl: previewUrl,
  });
  return {
    branch: identity.branch,
    previewUrl,
    sha: identity.sha,
  };
}

export function resolveCanaryIdentity(args: CanaryArgs): CanaryIdentity {
  if (args.mode === 'auto') {
    const identity = resolveLocalGitIdentity();
    debugLog(args.debug, 'local identity', identity);
    return resolveAutoPreviewIdentity(identity, execFileSync, args.debug);
  }
  return {
    branch: args.branch,
    previewUrl: args.previewUrl,
    sha: args.sha,
  };
}

export function parseVercelProjectLink(parsed: unknown): {
  orgId: string;
  projectId: string;
} {
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    !('projectId' in parsed) ||
    !('orgId' in parsed) ||
    typeof parsed.projectId !== 'string' ||
    typeof parsed.orgId !== 'string'
  ) {
    throw new Error('Vercel project link is missing or malformed.');
  }
  return { orgId: parsed.orgId, projectId: parsed.projectId };
}

function readVercelProjectLink(): { orgId: string; projectId: string } {
  const file = path.resolve(process.cwd(), '.vercel/project.json');
  let parsed: unknown;
  try {
    parsed = JSON.parse(
      readTextFileWithinBase(file, process.cwd(), 'Vercel project link'),
    );
  } catch {
    throw new Error('Vercel project link is missing or malformed.');
  }
  return parseVercelProjectLink(parsed);
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
      case 'INTERNAL_API_KEY':
        values.INTERNAL_API_KEY = value;
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
    | 'INTERNAL_API_KEY'
    | 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
): string | undefined {
  switch (key) {
    case 'AUTH_PROVIDER':
      return values.AUTH_PROVIDER?.trim() || undefined;
    case 'CLERK_SECRET_KEY':
      return values.CLERK_SECRET_KEY?.trim() || undefined;
    case 'DATABASE_URL':
      return values.DATABASE_URL?.trim() || undefined;
    case 'INTERNAL_API_KEY':
      return values.INTERNAL_API_KEY?.trim() || undefined;
    case 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY':
      return values.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() || undefined;
  }
}

export async function probeRuntimeDatabaseBinding(input: {
  deploymentProtectionBypass: string;
  deploymentUrl: string;
  internalApiKey: string;
}): Promise<string> {
  const signal = AbortSignal.timeout(RUNTIME_PROBE_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(
      new URL(
        '/api/internal/preview-canary/database-binding',
        input.deploymentUrl,
      ),
      {
        cache: 'no-store',
        headers: {
          accept: 'application/json',
          'x-internal-key': input.internalApiKey,
          'x-vercel-protection-bypass': input.deploymentProtectionBypass,
        },
        method: 'GET',
        redirect: 'error',
        signal,
      },
    );
  } catch {
    if (signal.aborted) throw new Error('Preview runtime probe timed out.');
    throw new Error('Preview runtime probe failed.');
  }
  if (response.status !== 200) {
    throw new Error(`Preview runtime probe failed (HTTP ${response.status}).`);
  }
  try {
    return parseRuntimeDatabaseHost(await readBoundedResponseBody(response));
  } catch (error) {
    if (signal.aborted) throw new Error('Preview runtime probe timed out.');
    throw error;
  }
}

export async function readBoundedResponseBody(
  response: Response,
): Promise<string> {
  if (!response.body)
    throw new Error('Preview runtime probe returned invalid evidence.');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 4096) {
        await reader.cancel();
        throw new Error('Preview runtime probe returned invalid evidence.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

export function parseRuntimeDatabaseHost(output: string): string {
  let value: unknown;
  try {
    value = JSON.parse(output);
  } catch {
    throw new Error('Preview runtime probe returned invalid evidence.');
  }
  if (
    !value ||
    typeof value !== 'object' ||
    Object.keys(value).length !== 1 ||
    !('databaseHost' in value) ||
    typeof value.databaseHost !== 'string' ||
    value.databaseHost.length === 0 ||
    /[\s\u0000-\u001f\u007f/:?#@]/.test(value.databaseHost)
  ) {
    throw new Error('Preview runtime probe returned invalid evidence.');
  }
  return value.databaseHost;
}

export function parseImmutableDeploymentUrl(
  deployment: VercelDeployment,
): string {
  const hostname = deployment.url;
  if (
    typeof hostname !== 'string' ||
    hostname.length === 0 ||
    /[\s\u0000-\u001f\u007f/:?#@]/.test(hostname)
  ) {
    throw new Error('Vercel deployment did not return a valid immutable URL.');
  }
  let parsed: URL;
  try {
    parsed = new URL(`https://${hostname}`);
  } catch {
    throw new Error('Vercel deployment did not return a valid immutable URL.');
  }
  if (
    parsed.protocol !== 'https:' ||
    parsed.username !== '' ||
    parsed.password !== '' ||
    parsed.pathname !== '/' ||
    parsed.search !== '' ||
    parsed.hash !== ''
  ) {
    throw new Error('Vercel deployment did not return a valid immutable URL.');
  }
  return parsed.origin;
}

export async function executeReadOnlyCanary(
  identity: CanaryIdentity,
  execute: boolean,
): Promise<void> {
  const inspected = JSON.parse(
    runVercelOperation('inspect', ['inspect', identity.previewUrl, '--json']),
  ) as VercelDeployment;
  if (!inspected.id)
    throw new Error('Vercel inspect did not return a deployment ID.');
  const deployment = JSON.parse(
    runVercelOperation('deployment metadata', [
      'api',
      `/v13/deployments/${encodeURIComponent(inspected.id)}`,
      '--raw',
    ]),
  ) as VercelDeployment;
  const repository = parseRepository(requiredEnv('GITHUB_REPOSITORY'));
  const vercelIdentity = {
    orgId: requiredEnv('VERCEL_ORG_ID'),
    projectId: requiredEnv('VERCEL_PROJECT_ID'),
  };
  assertPreviewDeployment(deployment, {
    ...repository,
    branch: identity.branch,
    sha: identity.sha,
    ...vercelIdentity,
  });
  const immutableDeploymentUrl = parseImmutableDeploymentUrl(deployment);

  assertVercelProjectLink(readVercelProjectLink(), vercelIdentity);

  runVercelOperation('pull', [
    'pull',
    '--yes',
    '--environment=preview',
    `--git-branch=${identity.branch}`,
  ]);
  assertVercelProjectLink(readVercelProjectLink(), vercelIdentity);
  const previewEnv = readPreviewEnv();
  const provider = readPreviewValue(previewEnv, 'AUTH_PROVIDER');
  const internalApiKey = readPreviewValue(previewEnv, 'INTERNAL_API_KEY');
  if (!provider) {
    throw new Error('Preview environment must define AUTH_PROVIDER.');
  }
  if (!internalApiKey) {
    throw new Error(
      'Preview environment must define INTERNAL_API_KEY for the read-only canary.',
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

  const runtimeDatabaseHost = await probeRuntimeDatabaseBinding({
    deploymentProtectionBypass: requiredEnv('VERCEL_AUTOMATION_BYPASS_SECRET'),
    deploymentUrl: immutableDeploymentUrl,
    internalApiKey,
  });

  execFileSync(
    'pnpm',
    [
      'neon',
      '--',
      'verify-preview-endpoint',
      `--git-branch=${identity.branch}`,
      `--database-host=${runtimeDatabaseHost}`,
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );

  console.log(
    JSON.stringify({
      ...redactedEvidence({ ...identity, provider }),
      mode: 'read-only',
      mutation: execute
        ? 'refused: A3b owns fixture mutation'
        : 'not requested',
      neonPreviewBranch: `preview/${identity.branch}`,
      runtimeDatabaseHost,
    }),
  );
}

export async function run(argv = process.argv): Promise<void> {
  const args = parseCanaryArgs(argv.slice(2));
  const identity = resolveCanaryIdentity(args);
  await executeReadOnlyCanary(identity, args.execute);
}

const isMain = process.argv[1]?.endsWith('/scripts/preview-canary/cli.ts');
if (isMain) {
  void run().catch((error: unknown) => {
    console.error(
      `[preview-canary] ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  });
}
