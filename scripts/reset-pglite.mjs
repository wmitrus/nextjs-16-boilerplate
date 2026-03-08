import { spawnSync } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const DEFAULT_PGLITE_PATH = './data/pglite';
const PGLITE_URL_PREFIX = 'pglite://';
const FILE_URL_PREFIX = 'file:';

/**
 * Mirrors the path-resolution logic in src/core/db/drivers/create-pglite.ts.
 * Intentionally duplicated — the TypeScript source cannot be imported from a
 * plain ESM .mjs script without a tsx/ts-node dependency.
 */
export function resolvePglitePathFromUrl(url) {
  if (!url?.trim()) return DEFAULT_PGLITE_PATH;
  const u = url.trim();
  if (u.startsWith(PGLITE_URL_PREFIX)) {
    return u.slice(PGLITE_URL_PREFIX.length).trim() || DEFAULT_PGLITE_PATH;
  }
  if (u.startsWith(FILE_URL_PREFIX)) {
    return u.slice(FILE_URL_PREFIX.length).trim() || DEFAULT_PGLITE_PATH;
  }
  return u;
}

/**
 * @param {{ nodeEnv?: string; databaseUrl?: string }} config
 * @param {{ rm: Function; spawnSync: Function; log: Function }} deps
 * @returns {Promise<{ success: boolean; message: string }>}
 */
export async function performPgliteReset(config, deps) {
  const { nodeEnv, databaseUrl } = config;
  const { rm: rmFn, spawnSync: spawnSyncFn, log } = deps;

  if (nodeEnv === 'production') {
    return {
      success: false,
      message:
        '[reset-pglite] Refusing to run in NODE_ENV=production. This command is for local development only.',
    };
  }

  const resolvedPath = resolvePglitePathFromUrl(databaseUrl);

  log(`[reset-pglite] Resolved PGlite path: ${resolvedPath}`);
  log(`[reset-pglite] Removing ${resolvedPath} ...`);

  try {
    await rmFn(resolvedPath, { recursive: true, force: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      message: `[reset-pglite] Failed to remove ${resolvedPath}: ${message}`,
    };
  }

  log('[reset-pglite] Removed.');
  log('[reset-pglite] Running: pnpm db:migrate:dev');

  const result = spawnSyncFn('pnpm', ['db:migrate:dev'], {
    stdio: 'inherit',
    env: process.env,
  });

  if (result.error) {
    return {
      success: false,
      message: `[reset-pglite] Failed to spawn pnpm db:migrate:dev: ${result.error.message}`,
    };
  }

  if (result.status !== 0) {
    return {
      success: false,
      message: `[reset-pglite] pnpm db:migrate:dev exited with status ${result.status ?? 'unknown'}.`,
    };
  }

  return {
    success: true,
    message: '[reset-pglite] Done. PGlite database reset successfully.',
  };
}

async function resetPglite() {
  const result = await performPgliteReset(
    {
      nodeEnv: process.env.NODE_ENV,
      databaseUrl: process.env.DATABASE_URL,
    },
    {
      rm,
      spawnSync,
      log: console.log,
    },
  );

  if (result.success) {
    console.log(`✅ ${result.message}`);
  } else {
    console.error(`❌ ${result.message}`);
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  resetPglite().catch((err) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[reset-pglite] Unexpected error: ${message}`);
    process.exit(1);
  });
}
