import postgres from 'postgres';

const SYSTEM_IDENTIFIER_PATTERN = /^\d{1,20}$/;

const RESET_STATEMENTS = [
  'DROP SCHEMA public CASCADE',
  'DROP SCHEMA IF EXISTS drizzle CASCADE',
  'CREATE SCHEMA public',
  'GRANT ALL ON SCHEMA public TO postgres',
  'GRANT ALL ON SCHEMA public TO public',
] as const;

/**
 * OZI-219 P1 — the destructive local reset proves its target first. The
 * expected cluster `system_identifier` is read by `db-ops.mjs` inside the
 * local container (`readLocalDbSystemIdentifier`); a loopback URL alone is no
 * proof (a tunnel or port-forward can put another cluster behind it). The
 * identity is checked in the SAME transaction, on the same connection, as the
 * DROPs: PostgreSQL DDL is transactional, so a refusal drops nothing.
 */
export async function resetPostgresSchema(
  url: string,
  expectedSystemIdentifier: string | undefined,
): Promise<void> {
  if (
    !expectedSystemIdentifier ||
    !SYSTEM_IDENTIFIER_PATTERN.test(expectedSystemIdentifier)
  )
    throw new Error(
      '[postgres-schema-reset] a trusted target identity (system_identifier) is required; refused, nothing dropped.',
    );

  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await sql.begin(async (tx) => {
      let actual: string | undefined;
      try {
        const [row] = await tx.unsafe<{ id: string }[]>(
          'SELECT system_identifier::text AS id FROM pg_control_system()',
        );
        actual = row?.id;
      } catch {
        actual = undefined;
      }
      if (actual !== expectedSystemIdentifier)
        throw new Error(
          '[postgres-schema-reset] target is not the trusted local cluster (system_identifier mismatch or unreadable); refused, nothing dropped.',
        );

      // Constant statements only (no interpolation).
      for (const statement of RESET_STATEMENTS) await tx.unsafe(statement);
    });
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL?.trim();

  if (!url) {
    console.error('[postgres-schema-reset] DATABASE_URL is required.');
    process.exit(1);
  }

  await resetPostgresSchema(
    url,
    process.env.DB_RESET_EXPECTED_SYSTEM_IDENTIFIER?.trim(),
  );
  console.log('[postgres-schema-reset] Schema reset complete.');
}

// Import-safe entry point (`docs/ai/general/SCRIPT_IMPLEMENTATION_PATTERNS.md`).
if (process.argv[1]?.endsWith('/postgres-schema-reset.ts')) {
  main().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[postgres-schema-reset] Fatal: ${message}`);
    process.exit(1);
  });
}
