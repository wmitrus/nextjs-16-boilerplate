import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';

import {
  DEV_DEFAULT_URL,
  TEST_DEFAULT_URL,
  guardDevOperation,
  guardTestOperation,
  parsePostgresUrl,
} from './lib/db-guard.mjs';

const VALID_TARGETS = ['dev', 'test'];
const VALID_OPERATIONS = ['migrate', 'seed', 'reset', 'studio'];
const GUARDED_OPERATIONS = ['migrate', 'seed', 'reset'];

const DEV_DRIZZLE_CONFIG =
  'src/core/db/migrations/config/drizzle.dev.postgres.ts';
const TEST_DRIZZLE_CONFIG = 'src/core/db/migrations/config/drizzle.test.ts';

function getDrizzleConfig(target) {
  return target === 'dev' ? DEV_DRIZZLE_CONFIG : TEST_DRIZZLE_CONFIG;
}

/**
 * Resolves the target URL.
 * For 'dev': reads DATABASE_URL env, falls back to dev default.
 * For 'test': reads DATABASE_URL env only if it looks like a postgres URL,
 *             otherwise uses the test default (avoids PGlite URL confusion).
 */
function resolveUrl(target) {
  const envUrl = process.env.DATABASE_URL?.trim();
  const defaultUrl = target === 'dev' ? DEV_DEFAULT_URL : TEST_DEFAULT_URL;

  if (!envUrl) return defaultUrl;

  if (
    target === 'test' &&
    !envUrl.startsWith('postgres://') &&
    !envUrl.startsWith('postgresql://')
  ) {
    return defaultUrl;
  }

  return envUrl;
}

function logTarget(url) {
  const parsed = parsePostgresUrl(url);
  process.stdout.write(
    `[db-ops] Target: ${parsed.host}:${parsed.port}/${parsed.database}\n`,
  );
}

function run(cmd, args, env) {
  const result = spawnSync(cmd, args, {
    stdio: 'inherit',
    env: env ?? process.env,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runMigrate(url, target) {
  const config = getDrizzleConfig(target);
  run('pnpm', ['exec', 'drizzle-kit', 'migrate', `--config=${config}`], {
    ...process.env,
    DATABASE_URL: url,
  });
}

function runSeed(url) {
  run('pnpm', ['exec', 'tsx', 'scripts/db-seed.ts'], {
    ...process.env,
    DATABASE_URL: url,
    DB_DRIVER: 'postgres',
    DB_PROVIDER: 'drizzle',
  });
}

function runStudio(url, target) {
  const config = getDrizzleConfig(target);
  run('pnpm', ['exec', 'drizzle-kit', 'studio', `--config=${config}`], {
    ...process.env,
    DATABASE_URL: url,
  });
}

function runSchemaReset(url) {
  run('pnpm', ['exec', 'tsx', 'scripts/lib/postgres-schema-reset.ts'], {
    ...process.env,
    DATABASE_URL: url,
  });
}

async function promptConfirm(target, database, host, port) {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question(
      `\n⚠️  You are about to RESET the ${target} database (${database} @ ${host}:${port}).\n` +
        `    This will destroy all data.\n` +
        `    Type "yes" to continue or Ctrl+C to abort: `,
      (answer) => {
        rl.close();
        resolve(answer.trim().toLowerCase() === 'yes');
      },
    );
  });
}

async function main() {
  const args = process.argv.slice(2);
  const [target, operation, ...rest] = args;
  const force = rest.includes('--force');

  if (!VALID_TARGETS.includes(target)) {
    process.stderr.write(
      `[db-ops] Error: target must be one of: ${VALID_TARGETS.join(', ')}. Got: ${target ?? '(none)'}\n`,
    );
    process.exit(1);
  }

  if (!VALID_OPERATIONS.includes(operation)) {
    process.stderr.write(
      `[db-ops] Error: operation must be one of: ${VALID_OPERATIONS.join(', ')}. Got: ${operation ?? '(none)'}\n`,
    );
    process.exit(1);
  }

  const url = resolveUrl(target);

  if (GUARDED_OPERATIONS.includes(operation)) {
    if (target === 'dev') {
      guardDevOperation(url);
    } else {
      guardTestOperation(url);
    }
  }

  logTarget(url);

  if (operation === 'studio') {
    runStudio(url, target);
    return;
  }

  if (operation === 'migrate') {
    runMigrate(url, target);
    return;
  }

  if (operation === 'seed') {
    runSeed(url);
    return;
  }

  if (operation === 'reset') {
    const parsed = parsePostgresUrl(url);

    if (!force) {
      const confirmed = await promptConfirm(
        target,
        parsed.database,
        parsed.host,
        parsed.port,
      );

      if (!confirmed) {
        process.stdout.write('\n[db-ops] Reset cancelled.\n');
        process.exit(0);
      }

      process.stdout.write('\n');
    }

    process.stdout.write('[db-ops] Resetting schema...\n');
    runSchemaReset(url);

    process.stdout.write('[db-ops] Running migrations...\n');
    runMigrate(url, target);

    process.stdout.write('[db-ops] Running seed...\n');
    runSeed(url);

    process.stdout.write('[db-ops] Reset complete.\n');
  }
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`[db-ops] Fatal error: ${message}\n`);
  process.exit(1);
});
