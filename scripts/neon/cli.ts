const NEON_API_BASE_URL = 'https://console.neon.tech/api/v2/';
const GITHUB_API_BASE_URL = 'https://api.github.com/';
const RESOURCE_ID_PATTERN = /^[a-z0-9-]{1,60}$/;
const DEFAULT_BRANCH_LIMIT = 10;

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

interface NeonConfig {
  apiKey: string;
  branchLimit: number;
  projectId: string;
}

function requiredEnv(name: 'NEON_API_KEY' | 'NEON_PROJECT_ID'): string {
  const value = process.env[name]?.trim();
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

async function neonRequest<T>(
  config: NeonConfig,
  pathName: string,
  init: RequestInit = {},
): Promise<T | undefined> {
  const response = await fetch(new URL(pathName, NEON_API_BASE_URL), {
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
  const result = await neonRequest<NeonBranchesResponse>(
    config,
    `projects/${config.projectId}/branches`,
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

  await neonRequest(
    config,
    `projects/${config.projectId}/branches/${branch.id}`,
    { method: 'DELETE' },
  );
}

function parseRepository(value: string): { owner: string; repository: string } {
  const [owner, repository, ...rest] = value.split('/');
  if (!owner || !repository || rest.length > 0) {
    throw new Error('GITHUB_REPOSITORY must use the owner/repository format.');
  }
  return { owner, repository };
}

async function githubBranchExists(
  repositorySlug: string,
  branchName: string,
): Promise<boolean> {
  const { owner, repository } = parseRepository(repositorySlug);
  const url = new URL(
    `repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/branches/${encodeURIComponent(branchName)}`,
    GITHUB_API_BASE_URL,
  );
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

  throw new Error('Usage: neon <list|preview-check|delete>.');
}

const isMain = process.argv[1]?.endsWith('/scripts/neon/cli.ts');
if (isMain) {
  run().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[neon] ${message}`);
    process.exit(1);
  });
}
