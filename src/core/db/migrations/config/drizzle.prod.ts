import { defineConfig } from 'drizzle-kit';

// DATABASE_URL_UNPOOLED is the ONLY accepted source for Production DDL
// (Codex P1) -- it is the operator trust boundary, since a pooler/proxy
// hostname pattern cannot be reliably distinguished from a genuinely direct
// one (an unrecognized custom transaction-mode PgBouncer/proxy matches no
// known marker). There is deliberately no fallback to DATABASE_URL.
const migrationUrl = process.env.DATABASE_URL_UNPOOLED?.trim();

if (!migrationUrl) {
  throw new Error(
    '[drizzle.prod] DATABASE_URL_UNPOOLED is required for DDL migrations. ' +
      'DATABASE_URL is NOT accepted as a fallback (Codex P1): configure ' +
      'DATABASE_URL_UNPOOLED to an explicitly direct postgres connection.',
  );
}

if (
  !migrationUrl.startsWith('postgres://') &&
  !migrationUrl.startsWith('postgresql://')
) {
  throw new Error(
    '[drizzle.prod] DATABASE_URL_UNPOOLED must be a postgres:// or postgresql:// URL.',
  );
}

// DEFENSE-IN-DEPTH ONLY (Codex P1): rejects a KNOWN pooler marker even
// though `migrationUrl` already came exclusively from DATABASE_URL_UNPOOLED
// (the actual trust boundary, enforced above). Absence of a marker is NOT
// proof the endpoint is direct -- an unrecognized custom pooler/proxy
// matches none of these and would pass. Keep in sync with
// `POOLED_CONNECTION_MARKERS` in `src/core/db/post-migrate-steps.ts` (this
// drizzle-kit config file cannot import from `@/core` -- the drizzle-kit
// loader resolves it standalone).
const lowerUrl = migrationUrl.toLowerCase();
const isPoolerUrl =
  lowerUrl.includes('pgbouncer') ||
  lowerUrl.includes('-pooler.') ||
  lowerUrl.includes('pooler.supabase.com');

if (isPoolerUrl) {
  throw new Error(
    '[drizzle.prod] DATABASE_URL_UNPOOLED matches a KNOWN transaction-pooler ' +
      'marker (PgBouncer / Neon pooler / Supabase pooler). Migrations MUST ' +
      'use a genuinely direct connection.',
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
