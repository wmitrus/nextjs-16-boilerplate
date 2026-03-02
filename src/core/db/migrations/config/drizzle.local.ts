import { defineConfig } from 'drizzle-kit';

const databaseUrl = process.env.DATABASE_URL?.trim();

if (!databaseUrl) {
  throw new Error(
    '[drizzle.local] DATABASE_URL is required for local postgres migrations.',
  );
}

if (
  !databaseUrl.startsWith('postgres://') &&
  !databaseUrl.startsWith('postgresql://')
) {
  throw new Error(
    '[drizzle.local] DATABASE_URL must be a postgres:// or postgresql:// URL.',
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
