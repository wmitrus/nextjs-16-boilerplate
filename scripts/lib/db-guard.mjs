import { URL } from 'node:url';

export const DEV_DEFAULT_URL =
  'postgres://postgres:postgres@127.0.0.1:5432/app_dev';
const FIXED_TEST_URL = 'postgres://postgres:postgres@127.0.0.1:5433/app_test';

/**
 * OZI-221: the only alternative to the fixed 5433 test endpoint is the
 * ephemeral container owned by `scripts/db-test-ci-isolated.mjs`. It is
 * selected only when BOTH env vars are present and well-formed (partial or
 * malformed config throws -- never a silent fallback to 5433), host stays
 * 127.0.0.1 and the database stays app_test. The token is a per-run nonce
 * set as a server GUC on that container; `assertTestEndpointIdentity` proves
 * it in-band before use, so a foreign service on the port is refused.
 * Absent both vars, the fixed 5433 contract (CI, compose) is unchanged.
 * @param {Record<string, string | undefined>} env
 * @returns {{ port: number, token: string } | null}
 */
export function readIsolatedTestEndpoint(env) {
  const port = env.DB_TEST_ISOLATED_PORT?.trim();
  const token = env.DB_TEST_ISOLATED_TOKEN?.trim();
  if (!port && !token) return null;

  const portNumber = /^\d{4,5}$/.test(port ?? '') ? Number(port) : NaN;
  if (
    !(portNumber >= 1024 && portNumber <= 65535) ||
    portNumber === 5432 ||
    portNumber === 5433 ||
    !/^[0-9a-f]{32}$/.test(token ?? '')
  ) {
    throw new Error(
      '[db-guard] BLOCKED: DB_TEST_ISOLATED_PORT and DB_TEST_ISOLATED_TOKEN ' +
        'must both be set by `pnpm test:db:ci:isolated` (port 1024-65535, ' +
        'not 5432/5433; token 32 hex chars).',
    );
  }
  return { port: portNumber, token };
}

const ISOLATED_TEST_ENDPOINT = readIsolatedTestEndpoint(process.env);

/** Server GUC carrying the isolated runner's per-run token. */
export const TEST_ENDPOINT_TOKEN_SETTING = 'nextjs16.test_endpoint_token';

function isolatedTestUrl(port) {
  const url = new URL(FIXED_TEST_URL);
  url.port = String(port);
  return url.toString();
}

export const TEST_DEFAULT_URL = ISOLATED_TEST_ENDPOINT
  ? isolatedTestUrl(ISOLATED_TEST_ENDPOINT.port)
  : FIXED_TEST_URL;

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
 * Checks: port === 5433 (or the isolated runner's port, then host must be
 * 127.0.0.1), database === app_test.
 * @param {string} url
 */
export function assertTestTarget(url) {
  const parsed = parsePostgresUrl(url);
  const expectedPort = ISOLATED_TEST_ENDPOINT?.port ?? 5433;

  if (
    parsed.port !== expectedPort ||
    (ISOLATED_TEST_ENDPOINT && parsed.host !== '127.0.0.1')
  ) {
    process.stderr.write(
      `[db-guard] BLOCKED: test operation target check failed.\n` +
        `  Found   : ${parsed.host}:${parsed.port}, database "${parsed.database}"\n` +
        `  Expected: port ${expectedPort}, database "app_test"\n` +
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

/**
 * OZI-221: proves the server behind `url` is the isolated runner's own
 * container (its per-run token GUC) before any migrate or test connection.
 * No-op for the fixed 5433 contract, whose endpoint is the compose/CI
 * service. Throws (fail closed) on mismatch or when nothing answers.
 * @param {string} url
 */
export async function assertTestEndpointIdentity(url) {
  if (!ISOLATED_TEST_ENDPOINT) return;

  const { default: postgres } = await import('postgres');
  const sql = postgres(url, { connect_timeout: 5, max: 1, onnotice: () => {} });
  let observed;
  try {
    const [row] =
      await sql`SELECT current_setting(${TEST_ENDPOINT_TOKEN_SETTING}, true) AS token`;
    observed = row?.token;
  } catch {
    observed = undefined;
  } finally {
    await sql.end({ timeout: 2 }).catch(() => undefined);
  }

  if (observed !== ISOLATED_TEST_ENDPOINT.token) {
    const parsed = parsePostgresUrl(url);
    throw new Error(
      `[db-guard] BLOCKED: ${parsed.host}:${parsed.port} is not the isolated ` +
        `test endpoint of this run (token mismatch or unreachable). Refusing ` +
        `a foreign service.`,
    );
  }
}
