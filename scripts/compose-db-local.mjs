import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { pathExistsWithinBase } from './lib/fs-guards.mjs';

function assertPathWithinBase(resolvedPath, baseDir) {
  const normalizedBase = path.resolve(baseDir);
  const normalizedPath = path.resolve(resolvedPath);
  const expectedPrefix = normalizedBase.endsWith(path.sep)
    ? normalizedBase
    : normalizedBase + path.sep;
  if (
    normalizedPath !== normalizedBase &&
    !normalizedPath.startsWith(expectedPrefix)
  ) {
    throw new Error(
      `Security: file path escapes the allowed directory.\n` +
        `  Allowed base : ${normalizedBase}\n` +
        `  Resolved path: ${normalizedPath}\n`,
    );
  }
}

const PODMAN_CANDIDATES = [
  { bin: 'podman-compose', prefix: [] },
  { bin: 'podman', prefix: ['compose'] },
];

const DOCKER_CANDIDATES = [
  { bin: 'docker', prefix: ['compose'] },
  { bin: 'docker-compose', prefix: [] },
];

const COMPOSE_FILE_CANDIDATES = [
  'compose.yml',
  'podman-compose.yml',
  'docker-compose.yml',
];

function isCommandAvailable(candidate) {
  const args = candidate.prefix.length
    ? [...candidate.prefix, 'version']
    : ['--version'];

  const result = spawnSync(candidate.bin, args, {
    stdio: 'ignore',
    env: process.env,
  });

  return result.status === 0;
}

function pickComposeCommand() {
  const rawEngine = (process.env.DB_COMPOSE_ENGINE ?? 'podman').trim();
  const engine = rawEngine.toLowerCase();

  if (!['podman', 'docker', 'auto'].includes(engine)) {
    throw new Error(
      `[compose-db-local] Unsupported DB_COMPOSE_ENGINE="${rawEngine}". Use: podman | docker | auto.`,
    );
  }

  const candidates =
    engine === 'docker'
      ? DOCKER_CANDIDATES
      : engine === 'podman'
        ? PODMAN_CANDIDATES
        : [...PODMAN_CANDIDATES, ...DOCKER_CANDIDATES];

  const selected = candidates.find(isCommandAvailable);
  if (!selected) {
    const help =
      engine === 'podman'
        ? 'Install podman-compose or configure `podman compose` provider. If you prefer Docker, run with DB_COMPOSE_ENGINE=docker.'
        : engine === 'docker'
          ? 'Install Docker Compose (plugin or standalone).'
          : 'Install Podman or Docker compose tooling.';

    throw new Error(`[compose-db-local] No compose command available. ${help}`);
  }

  return selected;
}

function pickComposeFile() {
  const explicitFile = process.env.DB_COMPOSE_FILE?.trim();
  if (explicitFile) {
    assertPathWithinBase(path.resolve(explicitFile), process.cwd());
    if (!pathExistsWithinBase(explicitFile, process.cwd(), 'compose file')) {
      throw new Error(
        `[compose-db-local] DB_COMPOSE_FILE points to a missing file: ${explicitFile}`,
      );
    }
    return explicitFile;
  }

  const detectedFile = COMPOSE_FILE_CANDIDATES.find((candidate) =>
    pathExistsWithinBase(candidate, process.cwd(), 'compose file candidate'),
  );

  if (!detectedFile) {
    throw new Error(
      '[compose-db-local] No compose file found. Expected one of: compose.yml, podman-compose.yml, docker-compose.yml.',
    );
  }

  return detectedFile;
}

function run() {
  const forwardedArgs = process.argv.slice(2);
  if (forwardedArgs.length === 0) {
    throw new Error(
      '[compose-db-local] Missing compose arguments. Example: up -d test-db',
    );
  }

  const selected = pickComposeCommand();
  const composeFile = pickComposeFile();
  const args = [...selected.prefix, '-f', composeFile, ...forwardedArgs];

  const result = spawnSync(selected.bin, args, {
    stdio: 'inherit',
    env: process.env,
  });

  if (result.error) {
    throw result.error;
  }

  process.exit(result.status ?? 1);
}

try {
  run();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
}
