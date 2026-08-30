const NEON_API_ORIGIN = 'https://console.neon.tech';
const GITHUB_API_ORIGIN = 'https://api.github.com';
const RESOURCE_ID_PATTERN = /^[a-z0-9-]{1,60}$/;
const GITHUB_REPOSITORY_PART_PATTERN = /^[a-zA-Z0-9_.-]+$/;
const DEFAULT_BRANCH_LIMIT = 10;
const TRUSTED_PROVIDER_ENDPOINTS = {
  github: {
    origin: GITHUB_API_ORIGIN,
    pathname:
      /^\/repos\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+\/branches\/[a-zA-Z0-9_.%~-]+$/,
  },
  neon: {
    origin: NEON_API_ORIGIN,
    pathname:
      // eslint-disable-next-line security/detect-unsafe-regex -- anchored, both quantifiers are bounded ({1,60}) with no nested/overlapping repetition, so this cannot backtrack catastrophically.
      /^\/api\/v2\/projects\/[a-z0-9-]{1,60}\/branches(?:\/[a-z0-9-]{1,60}(?:\/endpoints)?)?$/,
  },
} as const;

type TrustedProviderScope =
  | { projectId: string; provider: 'neon' }
  | { owner: string; provider: 'github'; repository: string };

interface NeonBranch {
  created_at: string;
  default?: boolean;
  id: string;
  name: string;
  parent_id?: string;
  protected?: boolean;
}

interface NeonBranchesResponse {
  branches: NeonBranch[];
}

interface NeonEndpointsResponse {
  endpoints: Array<{ host?: string }>;
}

interface NeonConfig {
  apiKey: string;
  branchLimit: number;
  projectId: string;
}

function requiredEnv(name: 'NEON_API_KEY' | 'NEON_PROJECT_ID'): string {
  const raw =
    name === 'NEON_API_KEY'
      ? process.env.NEON_API_KEY
      : process.env.NEON_PROJECT_ID;
  const value = raw?.trim();
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

export function readNeonConfig(): NeonConfig {
  const projectId = requiredEnv('NEON_PROJECT_ID');
  if (!RESOURCE_ID_PATTERN.test(projectId)) {
    throw new Error('NEON_PROJECT_ID has an invalid format.');
  }

  const rawLimit = process.env.NEON_BRANCH_LIMIT?.trim();
  const branchLimit = rawLimit
    ? Number.parseInt(rawLimit, 10)
    : DEFAULT_BRANCH_LIMIT;
  if (!Number.isSafeInteger(branchLimit) || branchLimit < 2) {
    throw new Error('NEON_BRANCH_LIMIT must be an integer greater than 1.');
  }

  return {
    apiKey: requiredEnv('NEON_API_KEY'),
    branchLimit,
    projectId,
  };
}

export function assertDatabaseUrlBelongsToPreviewEndpoints(
  endpointHosts: readonly string[],
  databaseUrl: string,
): void {
  if (endpointHosts.length === 0) {
    throw new Error('Expected Neon Preview branch has no verifiable endpoint.');
  }

  let host: string;
  try {
    host = new URL(databaseUrl).hostname;
  } catch {
    throw new Error('DATABASE_URL is not a valid connection URL.');
  }

  if (!endpointHosts.includes(host)) {
    throw new Error(
      'DATABASE_URL does not belong to the expected Neon Preview branch.',
    );
  }
}

async function getBranchEndpointHosts(
  config: NeonConfig,
  branchId: string,
): Promise<string[]> {
  if (!RESOURCE_ID_PATTERN.test(branchId)) {
    throw new Error('Neon returned an invalid branch ID.');
  }
  const result = await neonRequest<NeonEndpointsResponse>(
    config,
    new URL(
      `/api/v2/projects/${config.projectId}/branches/${branchId}/endpoints`,
      NEON_API_ORIGIN,
    ),
  );
  return (result?.endpoints ?? [])
    .map((endpoint) => endpoint.host)
    .filter(
      (host): host is string => typeof host === 'string' && host.length > 0,
    );
}

export function assertTrustedProviderUrl(
  url: URL,
  scope: TrustedProviderScope,
): void {
  const endpoint = TRUSTED_PROVIDER_ENDPOINTS[scope.provider];
  const expectedPrefix =
    scope.provider === 'neon'
      ? `/api/v2/projects/${scope.projectId}/branches`
      : `/repos/${scope.owner}/${scope.repository}/branches/`;
  const isWithinScope =
    url.pathname === expectedPrefix ||
    url.pathname.startsWith(
      `${expectedPrefix}${expectedPrefix.endsWith('/') ? '' : '/'}`,
    );
  if (
    url.protocol !== 'https:' ||
    url.origin !== endpoint.origin ||
    !endpoint.pathname.test(url.pathname) ||
    !isWithinScope ||
    url.username !== '' ||
    url.password !== '' ||
    url.search !== '' ||
    url.hash !== ''
  ) {
    throw new Error('Refusing an unexpected provider API URL.');
  }
}

async function neonRequest<T>(
  config: NeonConfig,
  url: URL,
  init: RequestInit = {},
): Promise<T | undefined> {
  assertTrustedProviderUrl(url, {
    projectId: config.projectId,
    provider: 'neon',
  });
  const response = await fetch(url, {
    ...init,
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${config.apiKey}`,
      ...init.headers,
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(
      `Neon API returned ${response.status}${detail ? `: ${detail}` : ''}`,
    );
  }

  if (response.status === 204) {
    return undefined;
  }

  return (await response.json()) as T;
}

async function listBranches(config: NeonConfig): Promise<NeonBranch[]> {
  const pathname = `/api/v2/projects/${config.projectId}/branches`;
  const result = await neonRequest<NeonBranchesResponse>(
    config,
    new URL(pathname, NEON_API_ORIGIN),
  );
  return result?.branches ?? [];
}

async function deleteBranch(
  config: NeonConfig,
  branch: NeonBranch,
): Promise<void> {
  if (!RESOURCE_ID_PATTERN.test(branch.id)) {
    throw new Error(`Neon returned an invalid branch ID for ${branch.name}.`);
  }
  if (
    branch.default ||
    branch.protected ||
    !branch.name.startsWith('preview/')
  ) {
    throw new Error(`Refusing to automatically delete branch ${branch.name}.`);
  }

  const pathname = `/api/v2/projects/${config.projectId}/branches/${branch.id}`;
  await neonRequest(config, new URL(pathname, NEON_API_ORIGIN), {
    method: 'DELETE',
  });
}

function parseRepository(value: string): { owner: string; repository: string } {
  const [owner, repository, ...rest] = value.split('/');
  if (!owner || !repository || rest.length > 0) {
    throw new Error('GITHUB_REPOSITORY must use the owner/repository format.');
  }
  if (
    !GITHUB_REPOSITORY_PART_PATTERN.test(owner) ||
    !GITHUB_REPOSITORY_PART_PATTERN.test(repository)
  ) {
    throw new Error('GITHUB_REPOSITORY contains unsupported characters.');
  }
  return { owner, repository };
}

async function githubBranchExists(
  repositorySlug: string,
  branchName: string,
): Promise<boolean> {
  const { owner, repository } = parseRepository(repositorySlug);
  const pathname = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/branches/${encodeURIComponent(branchName)}`;
  const url = new URL(pathname, GITHUB_API_ORIGIN);
  assertTrustedProviderUrl(url, { owner, provider: 'github', repository });
  const token = process.env.GITHUB_TOKEN?.trim();
  const response = await fetch(url, {
    headers: {
      accept: 'application/vnd.github+json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      'x-github-api-version': '2022-11-28',
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (response.status === 404) {
    return false;
  }
  if (!response.ok) {
    throw new Error(`GitHub API returned ${response.status}.`);
  }
  return true;
}

export async function findOldestObsoletePreviewBranch(
  branches: NeonBranch[],
  currentGitBranch: string,
  branchExists: (branchName: string) => Promise<boolean>,
): Promise<NeonBranch | undefined> {
  const candidates = branches
    .filter((branch) => {
      return (
        branch.name.startsWith('preview/') &&
        branch.name !== `preview/${currentGitBranch}` &&
        !branch.default &&
        !branch.protected
      );
    })
    .sort((left, right) => {
      return Date.parse(left.created_at) - Date.parse(right.created_at);
    });

  for (const candidate of candidates) {
    const gitBranch = candidate.name.slice('preview/'.length);
    if (!(await branchExists(gitBranch))) {
      return candidate;
    }
  }

  return undefined;
}

function readOption(args: string[], name: string): string | undefined {
  const prefix = `${name}=`;
  const inline = args.find((arg) => arg.startsWith(prefix));
  if (inline) {
    return inline.slice(prefix.length);
  }
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function printBranches(branches: NeonBranch[], branchLimit: number): void {
  console.log(`Neon branches: ${branches.length}/${branchLimit}`);
  for (const branch of branches) {
    console.log(`${branch.id}\t${branch.name}\t${branch.created_at}`);
  }
}

async function previewCheck(config: NeonConfig, args: string[]): Promise<void> {
  const gitBranch = readOption(args, '--git-branch')?.trim();
  if (!gitBranch) {
    throw new Error('preview-check requires --git-branch=<name>.');
  }

  let branches = await listBranches(config);
  const expectedNeonBranch = `preview/${gitBranch}`;
  const existing = branches.some(
    (branch) => branch.name === expectedNeonBranch,
  );

  if (existing || branches.length < config.branchLimit) {
    console.log(
      `[neon] Preview capacity available (${branches.length}/${config.branchLimit}); expected branch: ${expectedNeonBranch}.`,
    );
    return;
  }

  if (!args.includes('--cleanup-obsolete')) {
    throw new Error(
      `Neon branch limit reached (${branches.length}/${config.branchLimit}) and ${expectedNeonBranch} does not exist.`,
    );
  }

  const repositorySlug = process.env.GITHUB_REPOSITORY?.trim();
  if (!repositorySlug) {
    throw new Error(
      'GITHUB_REPOSITORY is required to verify obsolete branches before cleanup.',
    );
  }

  const obsolete = await findOldestObsoletePreviewBranch(
    branches,
    gitBranch,
    (candidate) => githubBranchExists(repositorySlug, candidate),
  );
  if (!obsolete) {
    throw new Error(
      `Neon branch limit reached (${branches.length}/${config.branchLimit}), but no safely removable preview branch was found.`,
    );
  }

  console.log(
    `[neon] Removing obsolete preview branch ${obsolete.name} (${obsolete.id}); its GitHub branch no longer exists.`,
  );
  await deleteBranch(config, obsolete);
  branches = await listBranches(config);

  if (branches.length >= config.branchLimit) {
    throw new Error(
      `Neon cleanup completed, but branch capacity is still ${branches.length}/${config.branchLimit}.`,
    );
  }

  console.log(
    `[neon] Preview capacity restored (${branches.length}/${config.branchLimit}).`,
  );
}

async function verifyPreviewEndpoint(
  config: NeonConfig,
  args: string[],
): Promise<void> {
  const gitBranch = readOption(args, '--git-branch')?.trim();
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!gitBranch || !databaseUrl) {
    throw new Error(
      'verify-preview-endpoint requires --git-branch and DATABASE_URL.',
    );
  }

  const expectedName = `preview/${gitBranch}`;
  const branch = (await listBranches(config)).find(
    (candidate) => candidate.name === expectedName,
  );
  if (!branch) {
    throw new Error('Expected Neon Preview branch was not found.');
  }

  assertDatabaseUrlBelongsToPreviewEndpoints(
    await getBranchEndpointHosts(config, branch.id),
    databaseUrl,
  );
  console.log('[neon] Preview database endpoint verified.');
}

async function run(): Promise<void> {
  const args = process.argv.slice(2).filter((arg) => arg !== '--');
  const command = args[0];
  const config = readNeonConfig();

  if (command === 'list') {
    printBranches(await listBranches(config), config.branchLimit);
    return;
  }

  if (command === 'preview-check') {
    await previewCheck(config, args.slice(1));
    return;
  }

  if (command === 'verify-preview-endpoint') {
    await verifyPreviewEndpoint(config, args.slice(1));
    return;
  }

  if (command === 'delete') {
    const branchId = args[1];
    if (!branchId || !args.includes('--confirm')) {
      throw new Error('delete requires <branch-id> and --confirm.');
    }
    const branch = (await listBranches(config)).find(
      (candidate) => candidate.id === branchId,
    );
    if (!branch) {
      throw new Error(`Branch ${branchId} was not found.`);
    }
    await deleteBranch(config, branch);
    console.log(`[neon] Deleted ${branch.name} (${branch.id}).`);
    return;
  }

  throw new Error(
    'Usage: neon <list|preview-check|verify-preview-endpoint|delete>.',
  );
}

const isMain = process.argv[1]?.endsWith('/scripts/neon/cli.ts');
if (isMain) {
  run().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[neon] ${message}`);
    process.exit(1);
  });
}
