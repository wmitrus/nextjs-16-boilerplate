import postgres from 'postgres';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/**
 * The E2E server's database URL, only when it is a local container.
 *
 * Specs read back what the UI wrote so a green run proves persistence, not
 * just a 200. That read must never reach a shared or remote database, so
 * anything that is not a loopback postgres URL is refused.
 */
export function resolveLocalE2EDatabaseUrl(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string {
  const raw = env.DATABASE_URL?.trim();
  if (!raw) {
    throw new Error(
      '[e2e-db] DATABASE_URL is not set; run through scripts/e2e/run-scenario.mjs with E2E_BACKEND_MODE=container.',
    );
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('[e2e-db] DATABASE_URL is not a valid URL.');
  }
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new Error('[e2e-db] DATABASE_URL must be a postgres:// URL.');
  }
  if (!LOOPBACK_HOSTS.has(url.hostname)) {
    throw new Error(
      '[e2e-db] DATABASE_URL must point at a loopback host for E2E readback.',
    );
  }
  return raw;
}

/** Runs one read against the local E2E database and closes the client. */
export async function withLocalE2EDatabase<T>(
  read: (sql: postgres.Sql) => Promise<T>,
): Promise<T> {
  const sql = postgres(resolveLocalE2EDatabaseUrl(), {
    max: 1,
    prepare: false,
  });
  try {
    return await read(sql);
  } finally {
    await sql.end({ timeout: 5 });
  }
}
