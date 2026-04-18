import type { DbDriver, DbProvider } from '@/core/db/types';

export {
  assertPathWithinBase,
  readTextFileWithinBase,
  writeTextFileSyncWithinBase as writeTextFileWithinBase,
} from '../lib/fs-guards-shared';

export function parseArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const arg = process.argv.find((a) => a.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : undefined;
}

export function resolveDriver(): DbDriver {
  const explicit = process.env.DB_DRIVER?.trim();
  if (explicit === 'postgres' || explicit === 'pglite') return explicit;
  return process.env.NODE_ENV === 'production' ? 'postgres' : 'pglite';
}

export function resolveProvider(): DbProvider {
  return (
    (process.env.DB_PROVIDER?.trim() as DbProvider | undefined) ?? 'drizzle'
  );
}

export function assertDatabaseUrl(scriptName: string): string {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    console.error(
      `[${scriptName}] DATABASE_URL is required for postgres driver`,
    );
    process.exit(1);
  }
  return url;
}

export function isSchemaNotFoundError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes('relation') &&
    (msg.includes('does not exist') || msg.includes('undefined table'))
  );
}
