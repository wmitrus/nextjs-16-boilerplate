import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';

/**
 * OZI-221 — runs `db:test:migrate` + `test:db:ci` locally against an
 * ephemeral, run-owned Postgres instead of the shared fixed host port 5433
 * (which other local stacks may publish). The container binds a
 * docker-assigned 127.0.0.1 port and carries a per-run token GUC that
 * `db-guard`'s `assertTestEndpointIdentity` proves before every use.
 * Its exact id and engine are also handed to OZI-219's container identity
 * proof (`R4A_LOCAL_DB_CONTAINER` / `DB_COMPOSE_ENGINE`), which reads the
 * cluster `system_identifier` inside this container -- two independent
 * checks. Data lives on tmpfs, so no volume is created; only the container
 * id created here is ever removed, and a failed removal fails the run.
 * Nothing else is started, stopped or inspected. CI keeps the fixed-port
 * service path.
 */

if (process.env.NODE_ENV === 'production') {
  process.stderr.write('[db-isolated] BLOCKED: NODE_ENV=production.\n');
  process.exit(1);
}

const ENGINE = 'docker'; // the engine that creates (and is told about) the container
const docker = (...args) =>
  spawnSync(ENGINE, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

const token = randomBytes(16).toString('hex');
const created = docker(
  'run',
  '-d',
  '--rm',
  '--name',
  `nextjs16_test_db_isolated_${token.slice(0, 8)}`,
  '--label',
  'nextjs16.isolated-test-db=1',
  '-e',
  'POSTGRES_PASSWORD=postgres',
  '-e',
  'POSTGRES_DB=app_test',
  '-p',
  '127.0.0.1::5432',
  '--tmpfs',
  '/var/lib/postgresql/data',
  'postgres:16-alpine',
  'postgres',
  '-c',
  `nextjs16.test_endpoint_token=${token}`,
);
const id = created.stdout.trim();
if (created.status !== 0 || !/^[0-9a-f]{64}$/.test(id)) {
  process.stderr.write(
    `[db-isolated] could not start container:\n${created.stderr}`,
  );
  process.exit(1);
}

// spawnSync children receive Ctrl+C themselves; keep this process alive so
// the finally block below still removes the container.
let interrupted = false;
const onSignal = (signal) => {
  interrupted = true;
  process.stderr.write(
    `[db-isolated] ${signal} interrupted the run; exiting non-zero\n`,
  );
};
process.on('SIGINT', onSignal);
process.on('SIGTERM', onSignal);

let status = 1;
try {
  const port = /^127\.0\.0\.1:(\d+)$/m.exec(
    docker('port', id, '5432/tcp').stdout,
  )?.[1];
  if (!port) throw new Error('could not read the published port');

  let ready = false;
  for (let i = 0; i < 60 && !ready; i += 1) {
    ready =
      docker(
        'exec',
        id,
        'pg_isready',
        '-h',
        '127.0.0.1',
        '-U',
        'postgres',
        '-d',
        'app_test',
      ).status === 0;
    if (!ready)
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
  }
  if (!ready) throw new Error('container did not become ready in 60s');

  const env = {
    ...process.env,
    DB_TEST_ISOLATED_PORT: port,
    DB_TEST_ISOLATED_TOKEN: token,
    // OZI-219 identity proof: the exact container created above, via the
    // engine that created it (overrides any inherited value).
    R4A_LOCAL_DB_CONTAINER: id,
    DB_COMPOSE_ENGINE: ENGINE,
  };
  delete env.DATABASE_URL; // db-ops then resolves the guarded isolated URL
  process.stdout.write(
    `[db-isolated] endpoint 127.0.0.1:${port}/app_test (container ${id.slice(0, 12)})\n`,
  );

  const pnpm = (...args) =>
    spawnSync('pnpm', args, { stdio: 'inherit', env }).status ?? 1;
  status = pnpm('db:test:migrate');
  if (status === 0) status = pnpm('test:db:ci', ...process.argv.slice(2));
} catch (error) {
  process.stderr.write(
    `[db-isolated] ${error instanceof Error ? error.message : error}\n`,
  );
} finally {
  const removed = docker('rm', '-f', id);
  if (removed.status !== 0) {
    process.stderr.write(
      `[db-isolated] CLEANUP FAILED: container ${id} was not removed ` +
        `(remove it with \`${ENGINE} rm -f ${id}\`):\n${removed.stderr}`,
    );
    if (status === 0) status = 1;
  } else {
    process.stdout.write(
      `[db-isolated] removed container ${id.slice(0, 12)}\n`,
    );
  }
}
// Yield once so a signal queued while spawnSync blocked reaches onSignal.
setImmediate(() => process.exit(interrupted && status === 0 ? 1 : status));
