import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';

import type { DbRuntime } from '../types';

const DEFAULT_PGLITE_PATH = './data/pglite';
const PGLITE_URL_PREFIX = 'pglite://';
const FILE_URL_PREFIX = 'file:';

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

  const pglite = new PGlite(resolvedPath);
  const db = drizzle(pglite);

  return {
    db,
    close: async () => {
      await pglite.close();
    },
  };
}
