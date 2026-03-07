import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

import {
  applyEnv,
  loadScenarioEnv,
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

function run(command, args, env) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    env,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function main() {
  const { scenario, variant, withOauth, playwrightArgs } = parseArgs(
    process.argv.slice(2),
  );

  const envMap = loadScenarioEnv({
    scenario,
    variant,
    includeLocal: true,
  });

  const env = {
    ...envMap,
    ...process.env,
  };

  env.DATABASE_URL =
    process.env.DATABASE_URL ??
    resolveScenarioDatabaseUrl({
      scenario,
      variant,
    });
  env.DB_PROVIDER = process.env.DB_PROVIDER ?? env.DB_PROVIDER ?? 'drizzle';
  env.DB_DRIVER = process.env.DB_DRIVER ?? env.DB_DRIVER ?? 'pglite';
  env.E2E_ENABLED = 'true';
  env.NEXT_PUBLIC_E2E_ENABLED = 'true';
  env.PLAYWRIGHT_REUSE_EXISTING_SERVER = 'false';
  env.PLAYWRIGHT_TEST_BASE_URL =
    process.env.PLAYWRIGHT_TEST_BASE_URL ?? 'http://localhost:3000';

  applyEnv(env);

  const databasePath = resolveScenarioDatabasePath({ scenario, variant });
  fs.rmSync(databasePath, { recursive: true, force: true });

  const checkArgs = ['scripts/check-e2e-auth-env.mjs', '--scenario', scenario];
  if (variant) {
    checkArgs.push('--variant', variant);
  }
  if (withOauth) {
    checkArgs.push('--with-oauth');
  }

  run('node', checkArgs, env);
  run('pnpm', ['db:migrate:dev'], env);
  run('pnpm', ['db:seed'], env);
  run('pnpm', ['exec', 'playwright', 'test', ...playwrightArgs], env);
}

main();
