import postgres from 'postgres';

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL?.trim();

  if (!url) {
    console.error('[postgres-schema-reset] DATABASE_URL is required.');
    process.exit(1);
  }

  const sql = postgres(url, { max: 1 });

  try {
    await sql`DROP SCHEMA public CASCADE`;
    await sql`DROP SCHEMA IF EXISTS drizzle CASCADE`;
    await sql`CREATE SCHEMA public`;
    await sql`GRANT ALL ON SCHEMA public TO postgres`;
    await sql`GRANT ALL ON SCHEMA public TO public`;
    console.log('[postgres-schema-reset] Schema reset complete.');
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[postgres-schema-reset] Fatal: ${message}`);
  process.exit(1);
});
