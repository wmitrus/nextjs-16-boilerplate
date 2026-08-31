import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

import postgres from 'postgres';
import { z } from 'zod';

import { gate, type AssessmentGate } from './evidence';

const MIGRATIONS_JOURNAL_PATH =
  'src/core/db/migrations/generated/meta/_journal.json';
const MIGRATIONS_DIR = 'src/core/db/migrations/generated';

const GIT_READ_MAX_BUFFER_BYTES = 512 * 1024;
const DB_CONNECT_TIMEOUT_S = 10;
const DB_STATEMENT_TIMEOUT_MS = 5_000;
/**
 * Absolute sane ceiling on how many migration entries this tool will ever
 * ask Production for, independent of the candidate's own (already trusted)
 * count -- a second, unconditional bound so a corrupted/unexpected
 * candidate count could never turn into an unbounded read.
 */
const ABSOLUTE_MAX_MIGRATION_ENTRIES = 1000;

type GitExecutor = typeof execFileSync;

export type ProductionDatabaseIdentityResult =
  | { connectionString: string; status: 'OK' }
  | { reason: string; status: 'BLOCKED' | 'ERROR' };

/**
 * A variable merely being named `DATABASE_URL` proves nothing about which
 * database it points at -- a local `.env.vercel` pull can legitimately hold
 * a Preview, development, or stale-branch connection string, and the SELECT
 * that follows would still succeed against the wrong database. Worse, a
 * Postgres/Neon *host* alone does not identify a database either: one
 * endpoint can serve several databases. This proves, without ever opening a
 * connection, that the resolved connection string is a PostgreSQL URI whose
 * hostname AND decoded database name both exactly match two explicitly
 * declared trust anchors: `PRODUCTION_DATABASE_HOST` and
 * `PRODUCTION_DATABASE_NAME`.
 *
 * Both are non-secret, LOCAL_OPERATOR_DECLARED pins -- mirroring
 * `VERCEL_ORG_ID`/`VERCEL_PROJECT_ID`/`GITHUB_REPOSITORY` in kind, not in
 * independent verification strength. None of those is independently
 * provider-verified either; they are pins the operator declares, not a live
 * provider identity check, and this slice authorizes no additional remote
 * provider read to verify them. Each pin is only as trustworthy as how the
 * operator obtained it: both must come from a trusted Production source
 * held independently of the connection string being checked here (e.g. how
 * Production's database was provisioned, or a separately-read Vercel/Neon
 * Production configuration). Copying either value out of the very
 * `DATABASE_URL` this function validates would defeat the pin entirely --
 * it would make a Preview/dev/stale URL agree with itself.
 *
 * Never included in the result: the connection string, username, password,
 * or either mismatched value.
 */
export function resolveVerifiedProductionDatabaseUrl(): ProductionDatabaseIdentityResult {
  const connectionString =
    process.env.DATABASE_URL_UNPOOLED?.trim() ||
    process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    return { reason: 'DATABASE_URL is required.', status: 'BLOCKED' };
  }
  const expectedHost = process.env.PRODUCTION_DATABASE_HOST?.trim();
  if (!expectedHost) {
    return {
      reason: 'Expected Production database host is not configured locally.',
      status: 'BLOCKED',
    };
  }
  const expectedDatabaseName = process.env.PRODUCTION_DATABASE_NAME?.trim();
  if (!expectedDatabaseName) {
    return {
      reason: 'Expected Production database name is not configured locally.',
      status: 'BLOCKED',
    };
  }
  let parsed: URL;
  try {
    parsed = new URL(connectionString);
  } catch {
    return {
      reason: 'Resolved database connection string is malformed.',
      status: 'ERROR',
    };
  }
  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
    return {
      reason: 'Resolved database connection string is not a PostgreSQL URI.',
      status: 'ERROR',
    };
  }
  let actualDatabaseName: string;
  try {
    actualDatabaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  } catch {
    return {
      reason: 'Resolved database connection string is malformed.',
      status: 'ERROR',
    };
  }
  if (
    parsed.hostname.length === 0 ||
    parsed.hostname !== expectedHost ||
    actualDatabaseName.length === 0 ||
    actualDatabaseName !== expectedDatabaseName
  ) {
    return {
      reason:
        'Resolved database connection does not match the expected Production database host and name.',
      status: 'BLOCKED',
    };
  }
  return { connectionString, status: 'OK' };
}

export interface CandidateMigrationEntry {
  hash: string;
  tag: string;
}

export type CandidateMigrationJournalResult =
  | { journal: CandidateMigrationEntry[]; status: 'OK' }
  | { reason: string; status: 'BLOCKED' | 'ERROR' };

function readGitBlob(
  gitSha: string,
  path: string,
  executor: GitExecutor,
): string {
  return executor('git', ['show', `${gitSha}:${path}`], {
    encoding: 'utf8',
    maxBuffer: GIT_READ_MAX_BUFFER_BYTES,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).toString();
}

/**
 * Derives candidate-side migration evidence from the exact trusted
 * candidate Git SHA through local Git object access only
 * (`git show <sha>:<path>`) -- never the current working tree, never a
 * fetch. Fails closed to BLOCKED on a shallow checkout or a commit/path Git
 * cannot resolve locally; only local Git errors that prevent even
 * determining shallow-ness are ERROR.
 */
export function readCandidateMigrationJournal(
  gitSha: string,
  executor: GitExecutor = execFileSync,
): CandidateMigrationJournalResult {
  let shallow: string;
  try {
    shallow = executor('git', ['rev-parse', '--is-shallow-repository'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
      .toString()
      .trim();
  } catch {
    return {
      reason: 'Could not determine whether local Git history is shallow.',
      status: 'ERROR',
    };
  }
  if (shallow === 'true') {
    return {
      reason:
        'Local Git history is shallow; candidate migration evidence cannot be resolved locally.',
      status: 'BLOCKED',
    };
  }
  if (shallow !== 'false') {
    return {
      reason: 'Local Git shallow-history state is invalid.',
      status: 'ERROR',
    };
  }

  let journalRaw: string;
  try {
    journalRaw = readGitBlob(gitSha, MIGRATIONS_JOURNAL_PATH, executor);
  } catch {
    return {
      reason:
        'Candidate migration journal could not be resolved from local Git history.',
      status: 'BLOCKED',
    };
  }

  let tags: string[];
  try {
    const parsed = JSON.parse(journalRaw) as {
      entries?: Array<{ tag?: unknown }>;
    };
    if (!Array.isArray(parsed.entries)) throw new Error('malformed');
    tags = parsed.entries.map((entry) => {
      if (typeof entry.tag !== 'string') throw new Error('malformed');
      return entry.tag;
    });
  } catch {
    return {
      reason: 'Candidate migration journal is malformed at the trusted commit.',
      status: 'BLOCKED',
    };
  }

  const journal: CandidateMigrationEntry[] = [];
  for (const tag of tags) {
    let sql: string;
    try {
      sql = readGitBlob(gitSha, `${MIGRATIONS_DIR}/${tag}.sql`, executor);
    } catch {
      return {
        reason:
          'Candidate migration SQL could not be resolved from local Git history.',
        status: 'BLOCKED',
      };
    }
    journal.push({
      hash: createHash('sha256').update(sql).digest('hex'),
      tag,
    });
  }
  return { journal, status: 'OK' };
}

export type ProductionMigrationHashesResult =
  | { hashes: string[]; status: 'OK' }
  | { reason: string; status: 'BLOCKED' | 'ERROR' };

type PostgresFactory = typeof postgres;

/**
 * The one authorized Production migration-journal read: a single bounded
 * `SELECT hash FROM drizzle.__drizzle_migrations LIMIT expectedCount + 1`
 * inside an explicit PostgreSQL `read only` transaction, over a session
 * that also sets `default_transaction_read_only` -- two independent
 * controls, matching this repository's existing read-only DB tooling
 * pattern. Explicit connect/statement timeouts, at most one connection.
 * Never imports anything from the migration-repair tooling.
 *
 * Ordered by `hash` purely for reproducibility across repeated runs -- NOT
 * a claim about migration/journal order. `drizzle.__drizzle_migrations`'s
 * `created_at` is populated from `_journal.json.entries[].when`, and this
 * repository's real journal contains non-monotonic `when` values (plus the
 * existing migration-repair tooling can insert rows stamped with
 * `Date.now()` later), so `created_at` ordering cannot honestly be read as
 * `_journal.entries` order here. The comparison this evidence supports is
 * therefore exact applied-migration *hash-set* equality
 * (`assessAppliedMigrationHashSetCompatibility`), never positional/tag
 * equality -- Production never had a `tag` to compare in the first place.
 *
 * Bounded to `expectedCount + 1` rows -- the already-trusted candidate
 * journal length, plus exactly one extra. Because a `LIMIT` always returns
 * `min(actualRowCount, limit)` rows regardless of which specific rows are
 * selected, a returned count of `expectedCount + 1` reliably proves
 * Production has *more* than `expectedCount` migrations even though the
 * specific extra row is arbitrary -- the downstream count check on the
 * fetched set is what turns that into BLOCKED, not the row identity.
 * `expectedCount` is validated against an absolute ceiling independent of
 * the caller.
 *
 * The connection is never opened until `resolveVerifiedProductionDatabaseUrl()`
 * has proven the target's identity. Client construction itself
 * (`clientFactory(...)`) is inside the same bounded error boundary as the
 * query and the close: `postgres.js` parses the URL/options synchronously
 * during construction, so it can throw before any query ever runs. That
 * throw, a query/transaction failure, and a `client.end()` failure all
 * collapse to the same bounded generic ERROR evidence -- a close failure
 * after an otherwise successful SELECT still means deterministic cleanup
 * was never established, so it must not be reported as a successful read.
 * If construction itself fails, `client.end()` is never attempted (no
 * client was actually established to close). Neither the connection
 * string nor any host/database value nor a raw driver error is ever
 * included in a returned message.
 */
export async function readProductionAppliedMigrationHashes(
  expectedCount: number,
  clientFactory: PostgresFactory = postgres,
): Promise<ProductionMigrationHashesResult> {
  if (
    !Number.isInteger(expectedCount) ||
    expectedCount < 0 ||
    expectedCount > ABSOLUTE_MAX_MIGRATION_ENTRIES
  ) {
    return {
      reason: 'Candidate migration count is out of the accepted bound.',
      status: 'ERROR',
    };
  }
  const identity = resolveVerifiedProductionDatabaseUrl();
  if (identity.status !== 'OK') {
    return { reason: identity.reason, status: identity.status };
  }

  const boundedError: ProductionMigrationHashesResult = {
    reason: 'Production migration-journal read failed.',
    status: 'ERROR',
  };

  let client: ReturnType<PostgresFactory>;
  try {
    client = clientFactory(identity.connectionString, {
      connect_timeout: DB_CONNECT_TIMEOUT_S,
      connection: {
        default_transaction_read_only: true,
        statement_timeout: DB_STATEMENT_TIMEOUT_MS,
      },
      max: 1,
      prepare: false,
    });
  } catch {
    // Construction itself threw -- no client was established, so there is
    // nothing to close.
    return boundedError;
  }

  let result: ProductionMigrationHashesResult;
  try {
    const rowLimit = expectedCount + 1;
    const rows = await client.begin('read only', async (tx) => {
      // `postgres`'s `TransactionSql` type loses its call signature through
      // the `Omit` it is built with (a known upstream typing gap) even
      // though the runtime value is the same callable tagged-template
      // function `Sql` is -- this cast reflects that, not a type escape.
      const query = tx as unknown as postgres.Sql;
      return query`select hash from drizzle.__drizzle_migrations order by hash asc limit ${rowLimit}`;
    });
    result = {
      hashes: (rows as unknown as Array<{ hash: unknown }>).map((row) =>
        String(row.hash),
      ),
      status: 'OK',
    };
  } catch {
    result = boundedError;
  }
  // A close failure must downgrade even an otherwise-successful read: it
  // means this call could not deterministically establish that the
  // connection was actually torn down.
  try {
    await client.end({ timeout: 5 });
  } catch {
    result = boundedError;
  }
  return result;
}

const migrationHashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const migrationHashSetSchema = z
  .array(migrationHashSchema)
  .superRefine((hashes, context) => {
    const seen = new Set<string>();
    for (const [index, hash] of hashes.entries()) {
      if (seen.has(hash)) {
        context.addIssue({
          code: 'custom',
          message: 'Duplicate migration hash.',
          path: [index],
        });
      }
      seen.add(hash);
    }
  });

/**
 * The only comparison Production evidence can honestly support: exact
 * applied-migration *hash-set* equality -- not positional/tag equality.
 * `drizzle.__drizzle_migrations` never stored a `tag`, and its `created_at`
 * ordering does not reproduce `_journal.entries` order in this repository
 * (see `readProductionAppliedMigrationHashes`'s doc comment), so order must
 * never influence this result. A candidate/Production hash appearing more
 * than once, or any hash that is not exactly 64 lowercase hex characters,
 * is malformed evidence (INVALID) rather than silently deduplicated.
 */
export function assessAppliedMigrationHashSetCompatibility(input: {
  candidateMigrationHashes?: unknown;
  productionAppliedMigrationHashes?: unknown;
}): AssessmentGate {
  if (
    input.candidateMigrationHashes === undefined ||
    input.productionAppliedMigrationHashes === undefined
  ) {
    return gate(
      'BLOCKED',
      'Candidate and Production applied migration-hash evidence is required.',
    );
  }
  const candidate = migrationHashSetSchema.safeParse(
    input.candidateMigrationHashes,
  );
  const production = migrationHashSetSchema.safeParse(
    input.productionAppliedMigrationHashes,
  );
  if (!candidate.success || !production.success) {
    return gate('INVALID', 'Applied migration-hash evidence is malformed.');
  }
  const candidateSet = new Set(candidate.data);
  const productionSet = new Set(production.data);
  const mismatch = gate(
    'BLOCKED',
    'Candidate and Production applied migration-hash sets do not exactly match.',
  );
  if (candidateSet.size !== productionSet.size) return mismatch;
  for (const hash of candidateSet) {
    if (!productionSet.has(hash)) return mismatch;
  }
  return gate(
    'PASS',
    'Candidate and Production applied migration-hash sets exactly match.',
  );
}
