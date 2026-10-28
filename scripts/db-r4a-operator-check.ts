/**
 * OZI-218 — environment-pinned, read-only R4a `--check` launcher.
 *
 * Before any database connection it proves, against the Neon Management API,
 * that the direct URL read from the profile's own file belongs to the
 * expected Neon project, branch and database. The URL never comes from the
 * shell or `.env.local`, and the only mode it can launch is `--check`.
 */
import * as path from 'node:path';
import { parseEnv } from 'node:util';

import { assertNoKnownPoolerMarker } from '@/core/db/post-migrate-steps';

import { readTextFileWithinBase } from './lib/fs-guards-shared';
import {
  getBranchDatabaseNames,
  getBranchEndpointHosts,
  listBranches,
  resolveExpectedPreviewDatabaseName,
  type NeonBranch,
  type NeonConfig,
} from './neon/cli';

/** Operator-confirmed Production identity (OZI-218); identifiers, not secrets. */
export const R4A_PRODUCTION_TARGET = {
  projectId: 'sparkling-sun-12905030',
  branchId: 'br-young-firefly-ag11fwch',
  database: 'neondb',
} as const;

const NEON_FILE = '.env.neon';
const GIT_BRANCH_PATTERN = /^[A-Za-z0-9._][A-Za-z0-9._/-]{0,199}$/;
const SSL_MODES = new Set(['require', 'verify-ca', 'verify-full']);
const USAGE =
  'usage: production | preview --git-branch=<name> (read-only --check only)';

type Profile = R4aOperatorCommand['profile'];
const profileFile = (profile: Profile) =>
  profile === 'production' ? '.env.production.local' : '.env.preview.local';
export type R4aOperatorCommand =
  | { readonly profile: 'production' }
  | { readonly profile: 'preview'; readonly gitBranch: string };

export interface R4aOperatorDeps {
  /** File contents, or undefined when the file does not exist. */
  readFile(name: string): string | undefined;
  /** The process environment as inherited from the shell. */
  env: Readonly<Record<string, string | undefined>>;
  listBranches(config: NeonConfig): Promise<NeonBranch[]>;
  endpointHosts(config: NeonConfig, branchId: string): Promise<string[]>;
  databaseNames(config: NeonConfig, branchId: string): Promise<string[]>;
  /** Runs the existing R4a CLI in `--check` mode against the verified URL. */
  runCheck(url: string): Promise<void>;
  log(message: string): void;
}

class R4aOperatorRefusal extends Error {
  constructor(message: string) {
    super(`refused before any database connection: ${message}`);
    this.name = 'R4aOperatorRefusal';
  }
}

/** Strict whole-argv parsing; at most one `--`, only after the profile. */
export function parseR4aOperatorArgs(
  argv: readonly string[],
): R4aOperatorCommand {
  // pnpm forwards `pnpm <script> -- --git-branch=x` with the separator right
  // after the profile; that single position is the only one accepted.
  const args = argv[1] === '--' ? [argv[0], ...argv.slice(2)] : [...argv];
  if (args.length === 1 && args[0] === 'production')
    return { profile: 'production' };
  if (args[0] === 'preview') {
    const gitBranch =
      args.length === 2 && args[1]?.startsWith('--git-branch=')
        ? args[1].slice('--git-branch='.length)
        : args.length === 3 && args[1] === '--git-branch'
          ? args[2]
          : undefined;
    if (gitBranch && GIT_BRANCH_PATTERN.test(gitBranch))
      return { profile: 'preview', gitBranch };
  }
  throw new R4aOperatorRefusal(USAGE);
}

function readEnvFile(
  deps: R4aOperatorDeps,
  name: string,
): Record<string, string | undefined> {
  const content = deps.readFile(name);
  if (content === undefined) throw new R4aOperatorRefusal(`${name} not found`);
  try {
    return parseEnv(content);
  } catch {
    throw new R4aOperatorRefusal(`${name} could not be parsed`);
  }
}

function readNeonFileConfig(deps: R4aOperatorDeps): NeonConfig {
  const file = readEnvFile(deps, NEON_FILE);
  const apiKey = file.NEON_API_KEY?.trim();
  const projectId = file.NEON_PROJECT_ID?.trim();
  if (!apiKey || !projectId)
    throw new R4aOperatorRefusal(
      `${NEON_FILE} must define NEON_API_KEY and NEON_PROJECT_ID`,
    );
  // branchLimit is unused by read-only lookups; the type requires it.
  return { apiKey, projectId, branchLimit: 2 };
}

interface DirectTarget {
  readonly url: string;
  readonly host: string;
  readonly database: string;
}

/** Shape checks on the profile URL; messages never include the URL. */
function readDirectTarget(
  deps: R4aOperatorDeps,
  profile: Profile,
): DirectTarget {
  const name = profileFile(profile);
  const url = readEnvFile(deps, name).DATABASE_URL_UNPOOLED?.trim();
  if (!url)
    throw new R4aOperatorRefusal(`${name} must define DATABASE_URL_UNPOOLED`);
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new R4aOperatorRefusal(`${name} DATABASE_URL_UNPOOLED is not a URL`);
  }
  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:')
    throw new R4aOperatorRefusal(`${name} URL must use postgres(ql)://`);
  try {
    assertNoKnownPoolerMarker(url, 'R4a operator check');
  } catch {
    throw new R4aOperatorRefusal(`${name} URL is a pooled endpoint`);
  }
  if (!SSL_MODES.has(parsed.searchParams.get('sslmode') ?? ''))
    throw new R4aOperatorRefusal(
      `${name} URL must set sslmode=require|verify-ca|verify-full`,
    );
  const database = decodeURIComponent(parsed.pathname.slice(1));
  if (!database) throw new R4aOperatorRefusal(`${name} URL has no database`);
  return { url, host: parsed.hostname.toLowerCase(), database };
}

/** Resolves the Neon branch the profile is allowed to reach. */
async function expectedBranchId(
  deps: R4aOperatorDeps,
  config: NeonConfig,
  command: R4aOperatorCommand,
): Promise<string> {
  if (command.profile === 'production') {
    if (config.projectId !== R4A_PRODUCTION_TARGET.projectId)
      throw new R4aOperatorRefusal(
        `${NEON_FILE} NEON_PROJECT_ID is not the Production project`,
      );
    return R4A_PRODUCTION_TARGET.branchId;
  }
  const name = `preview/${command.gitBranch}`;
  const matches = (await deps.listBranches(config)).filter(
    (branch) => branch.name === name,
  );
  const branch = matches[0];
  if (matches.length !== 1 || !branch)
    throw new R4aOperatorRefusal(`Neon branch ${name} was not found`);
  if (
    branch.id === R4A_PRODUCTION_TARGET.branchId ||
    branch.default ||
    branch.protected
  )
    throw new R4aOperatorRefusal(`Neon branch ${name} is not a Preview branch`);
  return branch.id;
}

/**
 * All Neon Management API reads. A provider failure is a refusal: its
 * message is bounded and scrubbed of the API key before it can be printed.
 */
async function lookupNeonIdentity(
  deps: R4aOperatorDeps,
  config: NeonConfig,
  command: R4aOperatorCommand,
) {
  try {
    const branchId = await expectedBranchId(deps, config, command);
    const hosts = (await deps.endpointHosts(config, branchId)).map((host) =>
      host.toLowerCase(),
    );
    const databases = await deps.databaseNames(config, branchId);
    return { branchId, hosts, databases };
  } catch (error) {
    if (error instanceof R4aOperatorRefusal) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new R4aOperatorRefusal(
      `Neon identity lookup failed: ${message.replaceAll(config.apiKey, '[REDACTED]').slice(0, 300)}`,
    );
  }
}

export async function runR4aOperatorCheck(
  argv: readonly string[],
  deps: R4aOperatorDeps,
): Promise<void> {
  const command = parseR4aOperatorArgs(argv);
  if (deps.env.DATABASE_URL_UNPOOLED !== undefined)
    throw new R4aOperatorRefusal(
      `DATABASE_URL_UNPOOLED is set in the shell; unset it -- the target comes only from ${profileFile(command.profile)}`,
    );
  const target = readDirectTarget(deps, command.profile);
  const config = readNeonFileConfig(deps);
  const { branchId, hosts, databases } = await lookupNeonIdentity(
    deps,
    config,
    command,
  );
  if (!hosts.includes(target.host))
    throw new R4aOperatorRefusal(
      `the URL host is not a direct endpoint of Neon branch ${branchId}`,
    );
  const expectedDatabase =
    command.profile === 'production'
      ? R4A_PRODUCTION_TARGET.database
      : resolveExpectedPreviewDatabaseName(databases);
  if (
    target.database !== expectedDatabase ||
    !databases.includes(target.database)
  )
    throw new R4aOperatorRefusal(
      `the URL database is not the expected database of Neon branch ${branchId}`,
    );

  deps.log(
    `[db-r4a-operator-check] verified ${command.profile}: project ${config.projectId}, branch ${branchId}, database ${target.database}; running read-only --check`,
  );
  await deps.runCheck(target.url);
}

function defaults(): R4aOperatorDeps {
  return {
    readFile: (name) => {
      // Fixed repository-root file names only (profileFile / NEON_FILE).
      const root = process.cwd();
      try {
        return readTextFileWithinBase(path.resolve(root, name), root, name);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT')
          return undefined;
        throw error;
      }
    },
    env: { ...process.env },
    listBranches,
    endpointHosts: getBranchEndpointHosts,
    databaseNames: getBranchDatabaseNames,
    runCheck: async (url) => {
      // Imported only after verification: that module loads `.env.local` for
      // missing keys, which must not exist in the env snapshot above. The URL
      // is passed explicitly, so it never comes from that fallback.
      const { runR4aCompactIndexesCli } =
        await import('./db-r4a-compact-indexes');
      await runR4aCompactIndexesCli(['--check'], url);
    },
    log: (message) => console.log(message),
  };
}

if (process.argv[1]?.endsWith('/scripts/db-r4a-operator-check.ts')) {
  void runR4aOperatorCheck(process.argv.slice(2), defaults()).catch(
    async (error: unknown) => {
      const { redactR4aCliError } = await import('./db-r4a-compact-indexes');
      console.error('[db-r4a-operator-check]', redactR4aCliError(error));
      process.exitCode = 1;
    },
  );
}
