import postgres from 'postgres';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  inject,
  it,
  vi,
} from 'vitest';

/**
 * OZI-221 — a real, foreign Postgres occupying the endpoint port (here the
 * Testcontainers instance, which has never seen the isolated runner's
 * token) is refused before any migrate/test connection; the same server
 * proves itself only once it carries this run's token.
 */
const TOKEN = 'b'.repeat(32);
let url: string;
let admin: postgres.Sql;
let database: string;

async function loadGuardFor(port: string) {
  vi.resetModules();
  vi.stubEnv('DB_TEST_ISOLATED_PORT', port);
  vi.stubEnv('DB_TEST_ISOLATED_TOKEN', TOKEN);
  return import('../lib/db-guard.mjs');
}

beforeAll(() => {
  // Same resolution as create-test-db.ts: db-ci injects the Testcontainers
  // URL, test:db:local passes TEST_DATABASE_URL via env.
  const resolved =
    (inject('TEST_DATABASE_URL') as string | undefined) ??
    process.env.TEST_DATABASE_URL?.trim();
  if (!resolved) throw new Error('TEST_DATABASE_URL is not available');
  url = resolved;
  admin = postgres(url, { max: 1, onnotice: () => {} });
  database = new URL(url).pathname.slice(1);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await admin.unsafe(
    `ALTER DATABASE "${database}" RESET nextjs16.test_endpoint_token`,
  );
});

afterAll(async () => {
  await admin.end({ timeout: 5 });
});

describe('assertTestEndpointIdentity against a real Postgres (OZI-221)', () => {
  it('refuses a foreign Postgres on the port', async () => {
    const guard = await loadGuardFor(new URL(url).port);
    await expect(guard.assertTestEndpointIdentity(url)).rejects.toThrow(
      /not the isolated test endpoint/,
    );
  });

  it('refuses a Postgres presenting a different token', async () => {
    await admin.unsafe(
      `ALTER DATABASE "${database}" SET nextjs16.test_endpoint_token = '${'c'.repeat(32)}'`,
    );
    const guard = await loadGuardFor(new URL(url).port);
    await expect(guard.assertTestEndpointIdentity(url)).rejects.toThrow(
      /not the isolated test endpoint/,
    );
  });

  it('accepts the endpoint that carries this run token', async () => {
    await admin.unsafe(
      `ALTER DATABASE "${database}" SET nextjs16.test_endpoint_token = '${TOKEN}'`,
    );
    const guard = await loadGuardFor(new URL(url).port);
    await expect(
      guard.assertTestEndpointIdentity(url),
    ).resolves.toBeUndefined();
  });
});
