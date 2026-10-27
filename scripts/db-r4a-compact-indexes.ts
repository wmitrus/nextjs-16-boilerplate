import './load-env';

import postgres from 'postgres';

import { assertNoKnownPoolerMarker } from '@/core/db/post-migrate-steps';
import {
  r4aExecutorRunnerFromPostgres,
  runR4aCompactIndexExecutor,
  type R4aCompactIndexExecutorRunner,
} from '@/core/db/r4a-compact-index-executor';
import { inspectR4aCompactIndex } from '@/core/db/r4a-compact-index-inspection';

type SqlClient = ReturnType<typeof postgres>;
export interface R4aCliDeps {
  open(url: string): {
    client: SqlClient;
    runner: R4aCompactIndexExecutorRunner;
  };
  inspect: typeof inspectR4aCompactIndex;
  execute: typeof runR4aCompactIndexExecutor;
  log(value: unknown): void;
}

/** Never echo an operator-supplied connection string from the CLI error path. */
export function redactR4aCliError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/postgres(?:ql)?:\/\/[^\s'"`]+/giu, '[REDACTED_URL]');
}

function defaults(): R4aCliDeps {
  return {
    open: (url) => {
      const client = postgres(url, {
        prepare: false,
        max: 1,
        idle_timeout: 5,
        connect_timeout: 10,
      });
      return { client, runner: r4aExecutorRunnerFromPostgres(client) };
    },
    inspect: inspectR4aCompactIndex,
    execute: runR4aCompactIndexExecutor,
    log: (value) => console.log(JSON.stringify(value, null, 2)),
  };
}
export async function runR4aCompactIndexesCli(
  args: readonly string[],
  unpooledUrl: string | undefined,
  deps: R4aCliDeps = defaults(),
): Promise<void> {
  const check = args.length === 1 && args[0] === '--check';
  const apply =
    args.length === 2 &&
    args[0] === '--apply' &&
    args[1] === '--production-approved';
  if (!check && !apply)
    throw new Error('usage: --check | --apply --production-approved');
  const url = unpooledUrl?.trim();
  if (!url) throw new Error('DATABASE_URL_UNPOOLED is required');
  assertNoKnownPoolerMarker(url, 'R4a compact-index executor');
  const parsed = new URL(url);
  const { client, runner } = deps.open(url);
  try {
    if (check) {
      const evidence = await Promise.all(
        ['feature_flags', 'audit_log_settings'].map((table) =>
          deps.inspect(runner, table as 'feature_flags' | 'audit_log_settings'),
        ),
      );
      deps.log({
        mode: 'check',
        host: parsed.hostname,
        database: parsed.pathname.slice(1),
        evidence,
      });
    } else {
      const result = await deps.execute(runner);
      deps.log({
        mode: 'apply',
        host: parsed.hostname,
        database: parsed.pathname.slice(1),
        result,
      });
    }
  } finally {
    await client.end({ timeout: 5 });
  }
}

if (process.argv[1]?.endsWith('/db-r4a-compact-indexes.ts')) {
  void runR4aCompactIndexesCli(
    process.argv.slice(2),
    process.env.DATABASE_URL_UNPOOLED,
  ).catch((error: unknown) => {
    console.error(
      '[db-r4a-compact-indexes] Fatal error:',
      redactR4aCliError(error),
    );
    process.exitCode = 1;
  });
}
