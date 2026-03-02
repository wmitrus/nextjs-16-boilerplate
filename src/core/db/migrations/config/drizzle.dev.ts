import { defineConfig } from 'drizzle-kit';

const DEFAULT_PGLITE_PATH = './data/pglite';
const rawDatabaseUrl = process.env.DATABASE_URL?.trim();

function resolveDevPgliteUrl(): string {
  if (!rawDatabaseUrl) return DEFAULT_PGLITE_PATH;

  const lower = rawDatabaseUrl.toLowerCase();
  if (lower.startsWith('postgres://') || lower.startsWith('postgresql://')) {
    return DEFAULT_PGLITE_PATH;
  }

  return rawDatabaseUrl;
}

export default defineConfig({
  dialect: 'postgresql',
  driver: 'pglite' as const,
  schema: './src/modules/**/infrastructure/drizzle/schema.ts',
  out: './src/core/db/migrations/generated',
  dbCredentials: {
    url: resolveDevPgliteUrl(),
  },
});
