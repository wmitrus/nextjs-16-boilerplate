import { defineConfig } from 'drizzle-kit';

const unpooled = process.env.DATABASE_URL_UNPOOLED?.trim();
const pooled = process.env.DATABASE_URL?.trim();
const migrationUrl = unpooled || pooled;

if (!migrationUrl) {
  throw new Error(
    '[drizzle.prod] DATABASE_URL_UNPOOLED or DATABASE_URL is required for DDL migrations.\n' +
      'The effective migration URL must resolve to a direct (unpooled) postgres connection.',
  );
}

if (
  !migrationUrl.startsWith('postgres://') &&
  !migrationUrl.startsWith('postgresql://')
) {
  throw new Error(
    '[drizzle.prod] The effective migration URL must be a postgres:// or postgresql:// URL.',
  );
}

// Keep in sync with `POOLED_CONNECTION_MARKERS` in
// `src/core/db/post-migrate-steps.ts` (this drizzle-kit config file cannot
// import from `@/core` — the drizzle-kit loader resolves it standalone).
const lowerUrl = migrationUrl.toLowerCase();
const isPoolerUrl =
  lowerUrl.includes('pgbouncer') ||
  lowerUrl.includes('-pooler.') ||
  lowerUrl.includes('pooler.supabase.com');

if (isPoolerUrl) {
  throw new Error(
    '[drizzle.prod] The effective migration URL appears to be a pooled/PgBouncer URL.\n' +
      'Migrations MUST use the direct (unpooled) connection.',
  );
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/modules/**/infrastructure/drizzle/schema.ts',
  out: './src/core/db/migrations/generated',
  dbCredentials: {
    url: migrationUrl,
  },
});
