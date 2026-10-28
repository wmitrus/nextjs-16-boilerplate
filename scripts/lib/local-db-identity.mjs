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

  for (const bin of containerEngines()) {
    const result = spawn(
      bin,
      [
        'exec',
        profile.container,
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
      `container ${profile.container}; the ${target} target cannot be proven ` +
      `local. Start it with \`pnpm db:${target}:up\`.`,
  );
}
