import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { TEST_DEFAULT_URL } from '../lib/db-guard.mjs';

import {
  applyEnv,
  loadScenarioEnv,
  resolveE2EBackendMode,
  resolveScenarioDatabasePath,
  resolveScenarioDatabaseUrl,
  SCENARIO_NAMES,
  VARIANT_NAMES,
} from './load-env.mjs';

function parseArgs(argv) {
  const [scenario, ...rest] = argv;

  if (!scenario || !SCENARIO_NAMES.includes(scenario)) {
    throw new Error(
      `Missing or invalid scenario. Expected one of: ${SCENARIO_NAMES.join(', ')}`,
    );
  }

  let variant;
  let withOauth = false;
  const forwarded = [];

  for (let index = 0; index < rest.length; index += 1) {
    const value = rest[index];

    if (value === '--variant') {
      const nextValue = rest[index + 1];
      if (!nextValue || !VARIANT_NAMES.includes(nextValue)) {
        throw new Error(
          `Missing or invalid variant. Expected one of: ${VARIANT_NAMES.join(', ')}`,
        );
      }
      variant = nextValue;
      index += 1;
      continue;
    }

    if (value === '--with-oauth') {
      withOauth = true;
      continue;
    }

    if (value === '--') {
      forwarded.push(...rest.slice(index + 1));
      break;
    }

    forwarded.push(value);
  }

  return {
    scenario,
    variant,
    withOauth,
    playwrightArgs:
      forwarded.length > 0
        ? forwarded
        : ['e2e/provisioning-runtime.spec.ts', '--project=chromium'],
  };
}

function normalizePlaywrightArgs(args) {
  return args.filter((value) => value !== '--');
}

function isPlaywrightListMode(args) {
  return args.includes('--list');
}

function run(command, args, env) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    env,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function getRepoRoot() {
  return process.cwd();
}

function findRepoNextDevProcesses(repoRoot) {
  const result = spawnSync('ps', ['-eo', 'pid=,ppid=,args='], {
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    return [];
  }

  return result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(\d+)\s+(\d+)\s+(.*)$/);
      if (!match) {
        return null;
      }

      return {
        pid: Number(match[1]),
        ppid: Number(match[2]),
        args: match[3],
      };
    })
    .filter(Boolean)
    .filter(
      (entry) =>
        entry.args.includes(repoRoot) &&
        entry.args.includes('next/dist/bin/next dev'),
    );
}

function buildChildProcessMap() {
  const result = spawnSync('ps', ['-eo', 'pid=,ppid='], {
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    return new Map();
  }

  const childrenByParent = new Map();

  for (const line of result.stdout.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    const match = trimmed.match(/^(\d+)\s+(\d+)$/);
    if (!match) {
      continue;
    }

    const pid = Number(match[1]);
    const ppid = Number(match[2]);
    const existing = childrenByParent.get(ppid) ?? [];
    existing.push(pid);
    childrenByParent.set(ppid, existing);
  }

  return childrenByParent;
}

function collectDescendants(childrenByParent, rootPid, collected = new Set()) {
  const children = childrenByParent.get(rootPid) ?? [];

  for (const childPid of children) {
    if (collected.has(childPid)) {
      continue;
    }

    collected.add(childPid);
    collectDescendants(childrenByParent, childPid, collected);
  }

  return collected;
}

function processExists(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function terminateProcesses(pids) {
  for (const pid of pids) {
    if (!processExists(pid)) {
      continue;
    }

    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // Ignore already-exited processes.
    }
  }

  await new Promise((resolve) => setTimeout(resolve, 1000));

  for (const pid of pids) {
    if (!processExists(pid)) {
      continue;
    }

    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // Ignore already-exited processes.
    }
  }
}

async function isBaseUrlReachable(baseUrl) {
  try {
    const response = await fetch(baseUrl, {
      redirect: 'manual',
      signal: AbortSignal.timeout(3000),
    });
    return response.status > 0;
  } catch {
    return false;
  }
}

async function cleanupStaleLocalNextDevState(env, listMode) {
  if (listMode || env.CI) {
    return;
  }

  const baseUrl = env.PLAYWRIGHT_TEST_BASE_URL ?? 'http://localhost:3000';
  const baseUrlReachable = await isBaseUrlReachable(baseUrl);

  if (baseUrlReachable) {
    return;
  }

  const repoRoot = getRepoRoot();
  const repoNextDevProcesses = findRepoNextDevProcesses(repoRoot);

  if (repoNextDevProcesses.length === 0) {
    return;
  }

  const childrenByParent = buildChildProcessMap();
  const processesToTerminate = new Set();

  for (const entry of repoNextDevProcesses) {
    processesToTerminate.add(entry.pid);

    for (const childPid of collectDescendants(childrenByParent, entry.pid)) {
      processesToTerminate.add(childPid);
    }
  }

  await terminateProcesses([...processesToTerminate]);

  const nextDevLockPath = path.join(repoRoot, '.next', 'dev', 'lock');
  fs.rmSync(nextDevLockPath, { force: true });
}

function cleanupExplicitServerLogDir(env, listMode) {
  if (listMode) {
    return;
  }

  const logDir =
    typeof env.PLAYWRIGHT_SERVER_LOG_DIR === 'string'
      ? env.PLAYWRIGHT_SERVER_LOG_DIR.trim()
      : '';

  if (!logDir) {
    return;
  }

  fs.rmSync(path.join(getRepoRoot(), logDir), {
    recursive: true,
    force: true,
  });
}

function applySharedRuntimeEnv(env, scenario, variant) {
  const backendMode = resolveE2EBackendMode(env);
  const hasExplicitServerLogDir =
    typeof env.PLAYWRIGHT_SERVER_LOG_DIR === 'string' &&
    env.PLAYWRIGHT_SERVER_LOG_DIR.trim().length > 0;

  env.E2E_BACKEND_MODE = backendMode;
  env.DB_PROVIDER = 'drizzle';
  env.E2E_ENABLED = 'true';
  env.NEXT_PUBLIC_E2E_ENABLED = 'true';
  env.PLAYWRIGHT_REUSE_EXISTING_SERVER =
    env.PLAYWRIGHT_REUSE_EXISTING_SERVER ??
    (env.CI || hasExplicitServerLogDir ? 'false' : 'true');

  if (hasExplicitServerLogDir) {
    env.LOG_DIR = env.PLAYWRIGHT_SERVER_LOG_DIR;
  }

  env.PLAYWRIGHT_TEST_BASE_URL =
    env.PLAYWRIGHT_TEST_BASE_URL ?? 'http://localhost:3000';

  if (backendMode === 'container') {
    env.DATABASE_URL = TEST_DEFAULT_URL;
    env.DB_DRIVER = 'postgres';
    return backendMode;
  }

  env.DATABASE_URL =
    process.env.DATABASE_URL ??
    resolveScenarioDatabaseUrl({
      scenario,
      variant,
    });
  env.DB_DRIVER = 'pglite';

  return backendMode;
}

function preparePgliteDatabase(env, scenario, variant) {
  const databasePath = resolveScenarioDatabasePath({ scenario, variant });
  fs.rmSync(databasePath, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });

  run('pnpm', ['db:migrate:dev'], env);
  run('pnpm', ['db:seed'], env);
}

function prepareContainerDatabase(env) {
  run('pnpm', ['db:test:up'], env);
  run('node', ['scripts/db-ops.mjs', 'test', 'reset', '--force'], env);
}

async function main() {
  const { scenario, variant, withOauth, playwrightArgs } = parseArgs(
    process.argv.slice(2),
  );
  const normalizedPlaywrightArgs = normalizePlaywrightArgs(playwrightArgs);
  const listMode = isPlaywrightListMode(normalizedPlaywrightArgs);

  const envMap = loadScenarioEnv({
    scenario,
    variant,
    includeLocal: true,
  });

  const env = {
    ...envMap,
    ...process.env,
  };

  const backendMode = applySharedRuntimeEnv(env, scenario, variant);

  applyEnv(env);

  if (!listMode) {
    const checkArgs = [
      'scripts/check-e2e-auth-env.mjs',
      '--scenario',
      scenario,
    ];
    if (variant) {
      checkArgs.push('--variant', variant);
    }
    if (withOauth) {
      checkArgs.push('--with-oauth');
    }

    run('node', checkArgs, env);

    if (backendMode === 'container') {
      prepareContainerDatabase(env);
    } else {
      preparePgliteDatabase(env, scenario, variant);
    }
  }

  await cleanupStaleLocalNextDevState(env, listMode);
  cleanupExplicitServerLogDir(env, listMode);

  run('pnpm', ['exec', 'playwright', 'test', ...normalizedPlaywrightArgs], env);
}

await main();
