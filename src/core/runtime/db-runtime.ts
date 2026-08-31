import type { DbDriver, DbProvider } from '@/core/db/types';

export interface EffectiveDbRuntime {
  driver: DbDriver;
  provider: DbProvider;
}

export interface DbRuntimeResolutionInput {
  databaseUrl: string | undefined;
  dbDriver: DbDriver | undefined;
  dbProvider: DbProvider | undefined;
  nodeEnv: string | undefined;
}

/**
 * Single authoritative source of *effective* DB provider/driver semantics --
 * exactly the defaulting/validation `createRequestContainer`'s config
 * actually uses to construct the database client via `createDb()`. Every
 * caller that needs to know, or attest to, what DB runtime the application
 * effectively uses (`bootstrap.ts` itself, the Preview canary runtime
 * evidence route, and the rollback environment-contract dimensions) MUST
 * call this instead of reimplementing the defaulting rules -- a
 * reimplementation could silently drift from bootstrap's real semantics and
 * attest to a DB runtime the application does not actually use.
 *
 * Pure and input-driven -- takes explicit values rather than reading
 * `@/core/env` itself, so callers in different runtime contexts (Next.js
 * route handlers, Node CLI scripts) can each pass their own already-resolved
 * env values without this module depending on any one of them, and tests
 * exercise it without mocking `@/core/env`.
 *
 * Preserves bootstrap's exact current defaulting/validation:
 * - `dbProvider` unset -> `'drizzle'`
 * - `dbDriver` explicit -> used as-is
 * - `dbDriver` unset + `nodeEnv === 'production'` -> `'postgres'`
 * - `dbDriver` unset + non-production -> `'pglite'`
 * - `dbProvider === 'prisma'` with `dbDriver === 'pglite'` -> throws
 * - `dbProvider === 'prisma'` in production without `databaseUrl` -> throws
 */
export function resolveEffectiveDbRuntime(
  input: DbRuntimeResolutionInput,
): EffectiveDbRuntime {
  const provider = input.dbProvider ?? 'drizzle';
  const configuredDriver = input.dbDriver;

  if (provider === 'prisma' && configuredDriver === 'pglite') {
    throw new Error(
      '[bootstrap] DB_PROVIDER=prisma cannot be used with DB_DRIVER=pglite. Use postgres or leave DB_DRIVER unset.',
    );
  }

  if (
    provider === 'prisma' &&
    input.nodeEnv === 'production' &&
    !input.databaseUrl
  ) {
    throw new Error(
      '[bootstrap] DB_PROVIDER=prisma in production requires DATABASE_URL.',
    );
  }

  const driver =
    configuredDriver ??
    (input.nodeEnv === 'production' ? 'postgres' : 'pglite');

  return { driver, provider };
}
