import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';

import type { DbRuntime } from '../types';

const DEFAULT_PGLITE_PATH = './data/pglite';
const PGLITE_URL_PREFIX = 'pglite://';
const FILE_URL_PREFIX = 'file:';

export class PGliteWasmAbortError extends Error {
  readonly path: string;

  constructor(path: string) {
    super(
      `PGlite WASM abort at '${path}'. The local database may be corrupted.\nRun: pnpm db:reset:pglite`,
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

  let pglite: PGlite;
  try {
    pglite = new PGlite(resolvedPath);
  } catch (err) {
    if (isWasmAbortError(err)) {
      throw new PGliteWasmAbortError(resolvedPath);
    }
    throw err;
  }

  const db = drizzle(pglite);

  return {
    db,
    close: async () => {
      await pglite.close();
    },
  };
}
