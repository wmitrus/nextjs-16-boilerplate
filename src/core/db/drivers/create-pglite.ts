import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';

import type { DbRuntime, DrizzleDb } from '../types';

const DEFAULT_PGLITE_PATH = './data/pglite';
const PGLITE_URL_PREFIX = 'pglite://';
const FILE_URL_PREFIX = 'file:';
const MEMORY_PGLITE_PATH = 'memory://';

const cachedPgliteByPath = new Map<string, DbRuntime>();

function resolvePglitePath(url?: string): string {
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

  if (resolvedPath === MEMORY_PGLITE_PATH) {
    const pglite = new PGlite(resolvedPath);
    const db = drizzle(pglite) as unknown as DrizzleDb;
    return {
      db,
      close: async () => {
        await pglite.close();
      },
    };
  }

  const cachedDb = cachedPgliteByPath.get(resolvedPath);
  if (cachedDb) {
    return cachedDb;
  }

  const pglite = new PGlite(resolvedPath);
  const db = drizzle(pglite) as unknown as DrizzleDb;
  const runtime: DbRuntime = {
    db,
    close: async () => {
      await pglite.close();
    },
  };

  cachedPgliteByPath.set(resolvedPath, runtime);
  return runtime;
}
