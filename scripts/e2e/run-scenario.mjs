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

function applySharedRuntimeEnv(env, scenario, variant) {
  const backendMode = resolveE2EBackendMode(env);

  env.E2E_BACKEND_MODE = backendMode;
  env.DB_PROVIDER = 'drizzle';
  env.E2E_ENABLED = 'true';
  env.NEXT_PUBLIC_E2E_ENABLED = 'true';
  env.PLAYWRIGHT_REUSE_EXISTING_SERVER =
    env.PLAYWRIGHT_REUSE_EXISTING_SERVER ?? (env.CI ? 'false' : 'true');
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

function main() {
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

  run('pnpm', ['exec', 'playwright', 'test', ...normalizedPlaywrightArgs], env);
}

main();
