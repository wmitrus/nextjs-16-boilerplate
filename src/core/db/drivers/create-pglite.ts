import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';

import type { DrizzleDb } from '../types';

const DEFAULT_PGLITE_PATH = './data/pglite';
const PGLITE_URL_PREFIX = 'pglite://';
const FILE_URL_PREFIX = 'file:';
const MEMORY_PGLITE_PATH = 'memory://';

const cachedPgliteByPath = new Map<string, DrizzleDb>();

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

export function createPglite(url?: string): DrizzleDb {
  const resolvedPath = resolvePglitePath(url);

  if (resolvedPath === MEMORY_PGLITE_PATH) {
    return drizzle(new PGlite(resolvedPath)) as unknown as DrizzleDb;
  }

  const cachedDb = cachedPgliteByPath.get(resolvedPath);
  if (cachedDb) {
    return cachedDb;
  }

  const db = drizzle(new PGlite(resolvedPath)) as unknown as DrizzleDb;
  cachedPgliteByPath.set(resolvedPath, db);
  return db;
}
