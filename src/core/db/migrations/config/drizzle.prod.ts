import { defineConfig } from 'drizzle-kit';

const unpooled = process.env.DATABASE_URL_UNPOOLED?.trim();
const pooled = process.env.DATABASE_URL?.trim();

if (!unpooled) {
  throw new Error(
    '[drizzle.prod] DATABASE_URL_UNPOOLED is required for DDL migrations.\n' +
      'Using the pooled DATABASE_URL for migrations causes journal desync via PgBouncer.\n' +
      'Set DATABASE_URL_UNPOOLED to the direct (unpooled) Neon connection string.',
  );
}

if (
  !unpooled.startsWith('postgres://') &&
  !unpooled.startsWith('postgresql://')
) {
  throw new Error(
    '[drizzle.prod] DATABASE_URL_UNPOOLED must be a postgres:// or postgresql:// URL.',
  );
}

const isPoolerUrl =
  unpooled.includes('pgbouncer') || unpooled.includes('-pooler.');

if (isPoolerUrl) {
  throw new Error(
    '[drizzle.prod] DATABASE_URL_UNPOOLED appears to be a pooled/PgBouncer URL.\n' +
      'Migrations MUST use the direct connection (no -pooler. in the hostname).',
  );
}

if (
  pooled &&
  (unpooled === pooled ||
    (!pooled.includes('pgbouncer') && !pooled.includes('-pooler.')))
) {
  throw new Error(
    '[drizzle.prod] Invalid pooled/unpooled migration configuration.\n' +
      'DATABASE_URL must point at the pooled application URL and DATABASE_URL_UNPOOLED must point at the direct connection.\n' +
      'The current pooled/unpooled values are identical or DATABASE_URL does not point at a pooler URL.',
  );
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/modules/**/infrastructure/drizzle/schema.ts',
  out: './src/core/db/migrations/generated',
  dbCredentials: {
    url: unpooled,
  },
});
