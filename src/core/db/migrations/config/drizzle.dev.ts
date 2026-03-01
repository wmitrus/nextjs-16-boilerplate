import { defineConfig } from 'drizzle-kit';

const DEFAULT_PGLITE_PATH = './data/pglite';

export default defineConfig({
  dialect: 'postgresql',
  driver: 'pglite' as const,
  schema: './src/modules/**/infrastructure/drizzle/schema.ts',
  out: './src/core/db/migrations/generated',
  dbCredentials: {
    url: process.env.DATABASE_URL?.trim() || DEFAULT_PGLITE_PATH,
  },
});
