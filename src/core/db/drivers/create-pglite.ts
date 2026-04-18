import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';

import { resolveServerLogger } from '@/core/logger/di';

import {
  getOrCreateActivityState,
  getRuntimeDiagnosticState,
} from '@/shared/lib/observability/runtime-diagnostic-state';

import type { DbRuntime } from '../types';

const DEFAULT_PGLITE_PATH = './data/pglite';
const PGLITE_URL_PREFIX = 'pglite://';
const FILE_URL_PREFIX = 'file:';
const logger = resolveServerLogger().child({
  type: 'API',
  category: 'db',
  module: 'create-pglite',
});

export class PGliteWasmAbortError extends Error {
  readonly path: string;

  constructor(path: string) {
    super(
      `PGlite WASM abort at '${path}'. The local database may be corrupted.\nRun: pnpm db:pglite:reset`,
    );
    this.name = 'PGliteWasmAbortError';
    this.path = path;
  }
}

function isWasmAbortError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (err.constructor?.name === 'RuntimeError') return true;
  return /aborted\(\)/i.test(err.message);
}

export function resolvePglitePath(url?: string): string {
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

export function createPglite(url?: string): DbRuntime {
  const resolvedPath = resolvePglitePath(url);
  const diagnostics = getRuntimeDiagnosticState();
  const pathState = getOrCreateActivityState(
    diagnostics.pglitePaths,
    resolvedPath,
  );

  diagnostics.pgliteInitializations += 1;
  pathState.totalStarts += 1;
  pathState.activeCount += 1;
  pathState.lastStartedAt = Date.now();

  logger.info(
    {
      event: 'db:pglite:init_start',
      backend: 'pglite',
      storagePath: resolvedPath,
      initSequence: diagnostics.pgliteInitializations,
      pathInitCount: pathState.totalStarts,
      isRepeatInitForPath: pathState.totalStarts > 1,
      moduleReloadSuspected: pathState.totalStarts > 1,
      existingInstanceReused: false,
    },
    'Initializing new PGlite runtime',
  );

  let pglite: PGlite;
  try {
    pglite = new PGlite(resolvedPath);
  } catch (err) {
    pathState.activeCount = Math.max(0, pathState.activeCount - 1);
    pathState.lastFinishedAt = Date.now();
    logger.error(
      {
        event: 'db:pglite:init_failure',
        backend: 'pglite',
        storagePath: resolvedPath,
        initSequence: diagnostics.pgliteInitializations,
        pathInitCount: pathState.totalStarts,
        err,
      },
      'PGlite runtime initialization failed',
    );
    if (isWasmAbortError(err)) {
      throw new PGliteWasmAbortError(resolvedPath);
    }
    throw err;
  }

  const db = drizzle(pglite);

  pathState.activeCount = Math.max(0, pathState.activeCount - 1);
  pathState.lastFinishedAt = Date.now();

  logger.info(
    {
      event: 'db:pglite:init_complete',
      backend: 'pglite',
      storagePath: resolvedPath,
      initSequence: diagnostics.pgliteInitializations,
      pathInitCount: pathState.totalStarts,
    },
    'PGlite runtime initialized successfully',
  );

  return {
    db,
    close: async () => {
      logger.debug(
        {
          event: 'db:pglite:close_start',
          backend: 'pglite',
          storagePath: resolvedPath,
        },
        'Closing PGlite runtime',
      );
      await pglite.close();
      logger.debug(
        {
          event: 'db:pglite:close_complete',
          backend: 'pglite',
          storagePath: resolvedPath,
        },
        'Closed PGlite runtime',
      );
    },
  };
}
