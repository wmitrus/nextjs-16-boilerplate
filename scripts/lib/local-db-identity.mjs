import { spawnSync } from 'node:child_process';

/**
 * OZI-219 — trusted identity of the repository's local compose databases
 * (`podman-compose.yml`). A loopback URL is not proof of a local database: a
 * tunnel or port-forward can put a remote cluster behind 127.0.0.1. The
 * cluster `system_identifier` (random per initdb) is therefore read INSIDE the
 * named container over its local socket; `runMigrations` then requires the
 * server behind the URL to report the same identifier on the bootstrap
 * session before any R4a DDL.
 */
export const LOCAL_DB_CONTAINERS = new Map([
  ['dev', { container: 'nextjs16_dev_db', database: 'app_dev' }],
  ['test', { container: 'nextjs16_test_db', database: 'app_test' }],
]);

/**
 * CI runs the test database as a GitHub Actions service container, whose id
 * the workflow passes here (`${{ job.services.<id>.id }}`). The identity is
 * still read by exec inside that local container, never via the URL.
 */
const CONTAINER_OVERRIDE_ENV = 'R4A_LOCAL_DB_CONTAINER';
const CONTAINER_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;

const SYSTEM_IDENTIFIER_SQL =
  'SELECT system_identifier::text FROM pg_control_system()';

function containerEngines() {
  const engine = (process.env.DB_COMPOSE_ENGINE ?? 'podman')
    .trim()
    .toLowerCase();
  if (engine === 'docker') return ['docker'];
  if (engine === 'auto') return ['podman', 'docker'];
  return ['podman'];
}

/**
 * @param {'dev' | 'test'} target
 * @param {typeof spawnSync} [spawn]
 * @returns {string}
 */
export function readLocalDbSystemIdentifier(target, spawn = spawnSync) {
  const profile = LOCAL_DB_CONTAINERS.get(target);
  if (!profile) throw new Error(`[db-identity] unknown target: ${target}`);
  const override = process.env.R4A_LOCAL_DB_CONTAINER?.trim();
  if (override && !CONTAINER_NAME_PATTERN.test(override))
    throw new Error(
      `[db-identity] BLOCKED: ${CONTAINER_OVERRIDE_ENV} is not a container name or id.`,
    );
  const container = override || profile.container;

  for (const bin of containerEngines()) {
    const result = spawn(
      bin,
      [
        'exec',
        container,
        'psql',
        '-U',
        'postgres',
        '-d',
        profile.database,
        '-tAc',
        SYSTEM_IDENTIFIER_SQL,
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    const id = result.status === 0 ? String(result.stdout).trim() : '';
    if (/^\d{1,20}$/.test(id)) return id;
  }

  throw new Error(
    `[db-identity] BLOCKED: cannot read the cluster identity inside the local ` +
      `container ${container}; the ${target} target cannot be proven ` +
      `local. Start it with \`pnpm db:${target}:up\`.`,
  );
}
