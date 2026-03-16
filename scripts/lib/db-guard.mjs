import { URL } from 'node:url';

export const DEV_DEFAULT_URL =
  'postgres://postgres:postgres@127.0.0.1:5432/app_dev';
export const TEST_DEFAULT_URL =
  'postgres://postgres:postgres@127.0.0.1:5433/app_test';

/**
 * Parses a postgres:// or postgresql:// URL into components.
 * Throws if the URL is missing or not a valid postgres URL.
 * @param {string | undefined} url
 * @returns {{ host: string, port: number, database: string, user: string, password: string }}
 */
export function parsePostgresUrl(url) {
  if (!url || typeof url !== 'string' || !url.trim()) {
    process.stderr.write(
      '[db-guard] BLOCKED: DATABASE_URL is required but was not provided.\n',
    );
    process.exit(1);
  }

  const trimmed = url.trim();

  if (
    !trimmed.startsWith('postgres://') &&
    !trimmed.startsWith('postgresql://')
  ) {
    process.stderr.write(
      `[db-guard] BLOCKED: DATABASE_URL must be a postgres:// or postgresql:// URL.\n` +
        `  Found   : ${trimmed}\n` +
        `  Hint    : PGlite or file:// URLs are not valid for Postgres container operations.\n`,
    );
    process.exit(1);
  }

  const parsed = new URL(trimmed);

  return {
    host: parsed.hostname,
    port: parseInt(parsed.port || '5432', 10),
    database: parsed.pathname.replace(/^\//, ''),
    user: parsed.username,
    password: parsed.password,
  };
}

/**
 * Blocks execution if NODE_ENV is 'production'.
 */
export function assertNotProduction() {
  if (process.env.NODE_ENV === 'production') {
    process.stderr.write(
      '[db-guard] BLOCKED: Refusing to run in NODE_ENV=production.\n' +
        '  This command is for local development only.\n',
    );
    process.exit(1);
  }
}

/**
 * Asserts the URL targets the dev container profile.
 * Checks: port === 5432, database !== app_test, database !== postgres.
 * @param {string} url
 */
export function assertDevTarget(url) {
  const parsed = parsePostgresUrl(url);

  if (parsed.port !== 5432) {
    process.stderr.write(
      `[db-guard] BLOCKED: dev operation target check failed.\n` +
        `  Found   : port ${parsed.port}, database "${parsed.database}"\n` +
        `  Expected: port 5432, database ≠ app_test\n` +
        `  Hint    : You may be targeting the test database. Run \`pnpm db:test:migrate\` instead.\n`,
    );
    process.exit(1);
  }

  if (parsed.database === 'app_test') {
    process.stderr.write(
      `[db-guard] BLOCKED: dev operation target check failed.\n` +
        `  Found   : database "${parsed.database}" (this is the test database)\n` +
        `  Expected: database ≠ app_test\n` +
        `  Hint    : You are targeting the test database. Run \`pnpm db:test:migrate\` instead.\n`,
    );
    process.exit(1);
  }

  if (parsed.database === 'postgres') {
    process.stderr.write(
      `[db-guard] BLOCKED: dev operation target check failed.\n` +
        `  Found   : database "${parsed.database}" (this is the system database)\n` +
        `  Expected: database ≠ postgres\n` +
        `  Hint    : Do not run dev operations against the system database.\n`,
    );
    process.exit(1);
  }
}

/**
 * Asserts the URL targets the test container profile.
 * Checks: port === 5433, database === app_test.
 * @param {string} url
 */
export function assertTestTarget(url) {
  const parsed = parsePostgresUrl(url);

  if (parsed.port !== 5433) {
    process.stderr.write(
      `[db-guard] BLOCKED: test operation target check failed.\n` +
        `  Found   : port ${parsed.port}, database "${parsed.database}"\n` +
        `  Expected: port 5433, database "app_test"\n` +
        `  Hint    : You may be targeting the dev database. Run \`pnpm db:dev:migrate\` instead.\n`,
    );
    process.exit(1);
  }

  if (parsed.database !== 'app_test') {
    process.stderr.write(
      `[db-guard] BLOCKED: test operation target check failed.\n` +
        `  Found   : database "${parsed.database}"\n` +
        `  Expected: database "app_test"\n` +
        `  Hint    : Test operations require the app_test database on port 5433.\n`,
    );
    process.exit(1);
  }
}

/**
 * Full pre-flight check for a dev destructive operation.
 * @param {string} url
 */
export function guardDevOperation(url) {
  assertNotProduction();
  assertDevTarget(url);
}

/**
 * Full pre-flight check for a test destructive operation.
 * @param {string} url
 */
export function guardTestOperation(url) {
  assertNotProduction();
  assertTestTarget(url);
}
