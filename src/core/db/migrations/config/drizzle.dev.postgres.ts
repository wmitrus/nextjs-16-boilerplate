import { defineConfig } from 'drizzle-kit';

const DEFAULT_DEV_POSTGRES_URL =
  'postgres://postgres:postgres@127.0.0.1:5432/app_dev';

const rawDatabaseUrl = process.env.DATABASE_URL?.trim();

const databaseUrl = rawDatabaseUrl || DEFAULT_DEV_POSTGRES_URL;

if (
  !databaseUrl.startsWith('postgres://') &&
  !databaseUrl.startsWith('postgresql://')
) {
  throw new Error(
    '[drizzle.dev.postgres] DATABASE_URL must be a postgres:// or postgresql:// URL.\n' +
      `  Got: ${databaseUrl}\n` +
      '  For PGlite dev, use: pnpm db:pglite:migrate\n' +
      '  For prod, use: pnpm db:migrate:prod',
  );
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/modules/**/infrastructure/drizzle/schema.ts',
  out: './src/core/db/migrations/generated',
  dbCredentials: {
    url: databaseUrl,
  },
});
