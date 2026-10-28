import './load-env';

import postgres from 'postgres';

import { assertNoKnownPoolerMarker } from '@/core/db/post-migrate-steps';
import {
  r4aExecutorRunnerFromPostgres,
  runR4aCompactIndexExecutor,
  runR4aCompactIndexRecovery,
  type R4aCompactIndexExecutorRunner,
} from '@/core/db/r4a-compact-index-executor';
import {
  inspectR4aCompactIndex,
  type R4aCompactIndexTable,
} from '@/core/db/r4a-compact-index-inspection';

export interface R4aCliDeps {
  open(url: string): Promise<{
    runner: R4aCompactIndexExecutorRunner;
    close(): Promise<void>;
  }>;
  inspect: typeof inspectR4aCompactIndex;
  execute: typeof runR4aCompactIndexExecutor;
  recover: typeof runR4aCompactIndexRecovery;
  log(value: unknown): void;
}

const R4A_TABLES: readonly R4aCompactIndexTable[] = [
  'feature_flags',
  'audit_log_settings',
];
const USAGE =
  'usage: --check | --apply --production-approved | --recover-invalid --table <feature_flags|audit_log_settings> [--table <...>] --production-approved';

type R4aCliCommand =
  | { readonly mode: 'check' }
  | { readonly mode: 'apply' }
  | {
      readonly mode: 'recover-invalid';
      readonly tables: readonly R4aCompactIndexTable[];
    };

/**
 * Strict, whole-argv parsing. Each mode is its own authorization: standard
 * `--apply` never implies recovery, and recovery needs named tables plus its
 * own trailing `--production-approved`.
 */
export function parseR4aCliArgs(args: readonly string[]): R4aCliCommand {
  if (args.length === 1 && args[0] === '--check') return { mode: 'check' };
  if (
    args.length === 2 &&
    args[0] === '--apply' &&
    args[1] === '--production-approved'
  )
    return { mode: 'apply' };
  if (args[0] === '--recover-invalid') {
    if (args.at(-1) !== '--production-approved')
      throw new Error(
        `--recover-invalid requires its own --production-approved; ${USAGE}`,
      );
    const pairs = args.slice(1, -1);
    if (pairs.length === 0 || pairs.length % 2 !== 0)
      throw new Error(
        `--recover-invalid requires at least one --table <name>; ${USAGE}`,
      );
    const tables: R4aCompactIndexTable[] = [];
    for (let index = 0; index < pairs.length; index += 2) {
      const flag = pairs[index];
      const table = R4A_TABLES.find((name) => name === pairs[index + 1]);
      if (flag !== '--table' || !table || tables.includes(table))
        throw new Error(
          `--recover-invalid accepts only distinct --table <feature_flags|audit_log_settings>; ${USAGE}`,
        );
      tables.push(table);
    }
    return { mode: 'recover-invalid', tables };
  }
  throw new Error(USAGE);
}

/** Never echo an operator-supplied connection string from the CLI error path. */
export function redactR4aCliError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/postgres(?:ql)?:\/\/[^\s'"`]+/giu, '[REDACTED_URL]');
}

function defaults(): R4aCliDeps {
  return {
    open: async (url) => {
      const client = postgres(url, {
        prepare: false,
        max: 1,
        idle_timeout: 5,
        connect_timeout: 10,
        // Never retire the connection mid-run: the executor's advisory lock
        // and timeout policy live on this one session.
        max_lifetime: null,
      });
      let session: postgres.ReservedSql;
      try {
        // Pin one physical connection for the whole run.
        session = await client.reserve();
      } catch (error) {
        await client.end({ timeout: 5 });
        throw error;
      }
      return {
        runner: r4aExecutorRunnerFromPostgres(session),
        close: async () => {
          session.release();
          await client.end({ timeout: 5 });
        },
      };
    },
    inspect: inspectR4aCompactIndex,
    execute: runR4aCompactIndexExecutor,
    recover: runR4aCompactIndexRecovery,
    log: (value) => console.log(JSON.stringify(value, null, 2)),
  };
}
export async function runR4aCompactIndexesCli(
  args: readonly string[],
  unpooledUrl: string | undefined,
  deps: R4aCliDeps = defaults(),
): Promise<void> {
  const command = parseR4aCliArgs(args);
  const url = unpooledUrl?.trim();
  if (!url) throw new Error('DATABASE_URL_UNPOOLED is required');
  assertNoKnownPoolerMarker(url, 'R4a compact-index executor');
  const parsed = new URL(url);
  const { runner, close } = await deps.open(url);
  const target = { host: parsed.hostname, database: parsed.pathname.slice(1) };
  try {
    if (command.mode === 'check') {
      const evidence = await Promise.all(
        R4A_TABLES.map((table) => deps.inspect(runner, table)),
      );
      deps.log({ mode: 'check', ...target, evidence });
    } else if (command.mode === 'apply') {
      const result = await deps.execute(runner);
      deps.log({ mode: 'apply', ...target, result });
    } else {
      const result = await deps.recover(runner, command.tables);
      deps.log({
        mode: 'recover-invalid',
        ...target,
        tables: command.tables,
        result,
      });
    }
  } finally {
    await close();
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
