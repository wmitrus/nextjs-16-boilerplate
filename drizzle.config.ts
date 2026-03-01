import { defineConfig } from 'drizzle-kit';

const DEFAULT_PGLITE_DATABASE_URL = './data/pglite';
const nodeEnv = process.env.NODE_ENV ?? 'development';
const databaseUrl = process.env.DATABASE_URL?.trim();
const isProduction = nodeEnv === 'production';

function maskPostgresUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const database = parsed.pathname?.replace(/^\//, '') || '<unknown-db>';
    return `${parsed.protocol}//${parsed.hostname}:${parsed.port || '<default>'}/${database}`;
  } catch {
    return '<invalid-postgres-url>';
  }
}

if (isProduction && !databaseUrl) {
  throw new Error('DATABASE_URL is required when NODE_ENV=production');
}

if (
  isProduction &&
  databaseUrl &&
  !databaseUrl.startsWith('postgres://') &&
  !databaseUrl.startsWith('postgresql://')
) {
  throw new Error(
    'DATABASE_URL must be postgres/postgresql when NODE_ENV=production',
  );
}

const resolvedDatabaseUrl = databaseUrl || DEFAULT_PGLITE_DATABASE_URL;
const targetDisplay = isProduction
  ? maskPostgresUrl(resolvedDatabaseUrl)
  : resolvedDatabaseUrl;

console.log('[drizzle] Migration target resolved');
console.log(`- NODE_ENV: ${nodeEnv}`);
console.log(`- Driver: ${isProduction ? 'postgres' : 'pglite'}`);
console.log(`- Target: ${targetDisplay}`);

export default defineConfig({
  dialect: 'postgresql',
  ...(!isProduction ? { driver: 'pglite' as const } : {}),
  schema: './src/modules/authorization/infrastructure/drizzle/schema.ts',
  out: './src/migrations',
  dbCredentials: {
    url: resolvedDatabaseUrl,
  },
});
