import '../load-env';

import { randomUUID } from 'node:crypto';
import { closeSync } from 'node:fs';

import { createDb } from '@/core/db/create-db';
import type { DbDriver, DbProvider } from '@/core/db/types';

import {
  appendRecordDurably,
  openNewWalFileWithinBase,
  pathEntryExistsWithinBase,
  physicalBaseDir,
  publishFileAtomicallyWithinBase,
  removeCreatedArtifactsWithinBase,
  resolvePhysicalTargetWithinBase,
  sameFilesystemEntry,
} from '../lib/fs-guards-shared';

import {
  runAuditOwnershipBackfill,
  type AuditOwnershipBackfillDecision,
} from './backfill-canonical-ownership';

const DEFAULT_BATCH_SIZE = 500;

export interface AuditBackfillCliInvocation {
  readonly mode: 'dry-run' | 'apply';
  readonly applyWithoutConfirm: boolean;
  readonly batchSize: number;
  readonly settingsStartAfterId: string | null;
  readonly eventsStartAfterId: number | null;
  readonly decisionsPath: string | null;
  readonly reportPath: string | null;
}

export type AuditBackfillCliParse =
  | { readonly ok: true; readonly invocation: AuditBackfillCliInvocation }
  | { readonly ok: false; readonly error: string };

function parsePositiveInt(
  raw: string | undefined,
  label: string,
  fallback: number,
): { ok: true; value: number } | { ok: false; error: string } {
  if (raw === undefined) return { ok: true, value: fallback };
  if (!/^[0-9]+$/.test(raw)) {
    return { ok: false, error: `${label} must be a positive integer` };
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) {
    return {
      ok: false,
      error: `${label} must be between 1 and Number.MAX_SAFE_INTEGER`,
    };
  }
  return { ok: true, value };
}

function parseNonNegativeSafeInt(
  raw: string | undefined,
  label: string,
): { ok: true; value: number | null } | { ok: false; error: string } {
  if (raw === undefined) return { ok: true, value: null };
  if (!/^[0-9]+$/.test(raw)) {
    return { ok: false, error: `${label} must be a non-negative integer` };
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 0) {
    return {
      ok: false,
      error: `${label} must be between 0 and Number.MAX_SAFE_INTEGER`,
    };
  }
  return { ok: true, value };
}

export function parseAuditBackfillCliArgs(
  argv: readonly string[],
): AuditBackfillCliParse {
  const has = (flag: string) => argv.includes(flag);
  const arg = (name: string): string | undefined => {
    const prefix = `--${name}=`;
    return argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
  };

  const applyRequested = has('--apply');
  const confirmed = has('--confirm');
  const mode: 'dry-run' | 'apply' =
    applyRequested && confirmed ? 'apply' : 'dry-run';

  const batchSize = parsePositiveInt(
    arg('batch-size'),
    '--batch-size',
    DEFAULT_BATCH_SIZE,
  );
  if (!batchSize.ok) return batchSize;

  const eventsStartAfter = parseNonNegativeSafeInt(
    arg('events-start-after'),
    '--events-start-after',
  );
  if (!eventsStartAfter.ok) return eventsStartAfter;

  const settingsStartAfterId = arg('settings-start-after') ?? null;
  const decisionsPath = arg('decisions') ?? null;
  const reportPath = arg('report') ?? null;

  if (mode === 'apply' && (!decisionsPath || !reportPath)) {
    return {
      ok: false,
      error:
        '`--apply --confirm` requires BOTH --decisions=<new path> and ' +
        '--report=<new path>. Aborting before any DB access.',
    };
  }

  return {
    ok: true,
    invocation: {
      mode,
      applyWithoutConfirm: applyRequested && !confirmed,
      batchSize: batchSize.value,
      settingsStartAfterId,
      eventsStartAfterId: eventsStartAfter.value,
      decisionsPath,
      reportPath,
    },
  };
}

export interface ResolvedAuditBackfillArtifactPaths {
  readonly realBase: string;
  readonly decisionsPath: string | null;
  readonly reportPath: string | null;
  readonly tmpReportPath: string | null;
  readonly physicalDecisions: string | null;
  readonly physicalReport: string | null;
  readonly physicalTmpReport: string | null;
}

export type AuditArtifactPathResolution =
  | { readonly ok: true; readonly paths: ResolvedAuditBackfillArtifactPaths }
  | { readonly ok: false; readonly error: string };

export function resolveAuditBackfillArtifactPaths(
  decisionsPath: string | null,
  reportPath: string | null,
  baseDir: string,
): AuditArtifactPathResolution {
  const tmpReportPath = reportPath === null ? null : `${reportPath}.partial`;

  let realBase: string;
  const entries: Array<{ label: string; raw: string; physical: string }> = [];
  try {
    realBase = physicalBaseDir(baseDir);
    for (const [label, raw] of [
      ['--decisions', decisionsPath],
      ['--report', reportPath],
      ['--report (temp)', tmpReportPath],
    ] as Array<[string, string | null]>) {
      if (raw === null) continue;
      entries.push({
        label,
        raw,
        physical: resolvePhysicalTargetWithinBase(
          raw,
          baseDir,
          `audit-log:backfill ${label}`,
        ),
      });
    }
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }

  for (const [index, left] of entries.entries()) {
    for (const right of entries.slice(index + 1)) {
      if (left.physical === right.physical) {
        return {
          ok: false,
          error:
            `${left.label} (${left.raw}) and ${right.label} (${right.raw}) ` +
            `resolve to the same physical path: ${left.physical}. ` +
            'Provide distinct artifact paths.',
        };
      }
    }
  }

  const physicalOf = (label: string): string | null =>
    entries.find((entry) => entry.label === label)?.physical ?? null;

  return {
    ok: true,
    paths: {
      realBase,
      decisionsPath,
      reportPath,
      tmpReportPath,
      physicalDecisions: physicalOf('--decisions'),
      physicalReport: physicalOf('--report'),
      physicalTmpReport: physicalOf('--report (temp)'),
    },
  };
}

export interface ReservedAuditBackfillArtifacts {
  readonly realBase: string;
  readonly decisionsPath: string | null;
  readonly reportPath: string | null;
  readonly physicalReport: string | null;
  readonly physicalTmpReport: string | null;
  readonly decisionsFd: number | null;
  readonly reportTmpFd: number | null;
}

export function reserveAuditBackfillArtifacts(
  decisionsPath: string | null,
  reportPath: string | null,
  baseDir: string,
): ReservedAuditBackfillArtifacts {
  const resolution = resolveAuditBackfillArtifactPaths(
    decisionsPath,
    reportPath,
    baseDir,
  );
  if (!resolution.ok) throw new Error(resolution.error);

  const {
    realBase,
    physicalDecisions,
    physicalReport,
    physicalTmpReport,
  } = resolution.paths;

  for (const [artifactPath, label] of [
    [physicalDecisions, 'audit-log:backfill --decisions'],
    [physicalReport, 'audit-log:backfill --report'],
    [physicalTmpReport, 'audit-log:backfill --report (temp)'],
  ] as Array<[string | null, string]>) {
    if (artifactPath === null) continue;
    if (pathEntryExistsWithinBase(artifactPath, realBase, label)) {
      throw new Error(
        `${label} path already exists: ${artifactPath}. ` +
          'Refusing to overwrite prior audit evidence.',
      );
    }
  }

  const created: string[] = [];
  let decisionsFd: number | null = null;
  let reportTmpFd: number | null = null;

  const abort = (error: Error): never => {
    if (decisionsFd !== null) {
      try {
        closeSync(decisionsFd);
      } catch {}
    }
    if (reportTmpFd !== null) {
      try {
        closeSync(reportTmpFd);
      } catch {}
    }
    removeCreatedArtifactsWithinBase(
      created,
      realBase,
      'audit-log:backfill reservation cleanup',
    );
    throw error;
  };

  try {
    if (physicalDecisions !== null) {
      decisionsFd = openNewWalFileWithinBase(
        physicalDecisions,
        realBase,
        'audit-log:backfill --decisions',
      );
      created.push(physicalDecisions);
    }

    if (physicalTmpReport !== null) {
      reportTmpFd = openNewWalFileWithinBase(
        physicalTmpReport,
        realBase,
        'audit-log:backfill --report (temp)',
      );
      created.push(physicalTmpReport);
    }

    if (
      decisionsFd !== null &&
      reportTmpFd !== null &&
      sameFilesystemEntry(decisionsFd, reportTmpFd)
    ) {
      throw new Error(
        'audit-log:backfill --decisions and --report (temp) resolve to the ' +
          'same filesystem entry.',
      );
    }

    if (
      physicalReport !== null &&
      pathEntryExistsWithinBase(
        physicalReport,
        realBase,
        'audit-log:backfill --report',
      )
    ) {
      throw new Error(
        `audit-log:backfill --report path already exists: ${physicalReport}`,
      );
    }
  } catch (error) {
    return abort(error as Error);
  }

  return {
    realBase,
    decisionsPath,
    reportPath,
    physicalReport,
    physicalTmpReport,
    decisionsFd,
    reportTmpFd,
  };
}

export function finalizeAuditBackfillReport(
  reserved: Pick<
    ReservedAuditBackfillArtifacts,
    'realBase' | 'physicalReport' | 'physicalTmpReport' | 'reportTmpFd'
  >,
  reportJson: string,
): void {
  if (
    reserved.reportTmpFd === null ||
    reserved.physicalReport === null ||
    reserved.physicalTmpReport === null
  ) {
    return;
  }

  appendRecordDurably(
    reserved.reportTmpFd,
    reportJson.endsWith('\n') ? reportJson : `${reportJson}\n`,
  );
  publishFileAtomicallyWithinBase(
    reserved.physicalTmpReport,
    reserved.physicalReport,
    reserved.realBase,
    'audit-log:backfill --report',
  );
}

function resolveProvider(): DbProvider {
  const value = process.env.DB_PROVIDER?.trim();
  return value === 'drizzle' || value === 'prisma' ? value : 'drizzle';
}

function resolveDriver(): DbDriver {
  const value = process.env.DB_DRIVER?.trim();
  if (value === 'postgres' || value === 'pglite') return value;
  return process.env.NODE_ENV === 'production' ? 'postgres' : 'pglite';
}

export async function runAuditBackfillCli(
  argv = process.argv.slice(2),
): Promise<void> {
  const parsed = parseAuditBackfillCliArgs(argv);
  if (!parsed.ok) throw new Error(parsed.error);

  const {
    mode,
    applyWithoutConfirm,
    batchSize,
    settingsStartAfterId,
    eventsStartAfterId,
    decisionsPath,
    reportPath,
  } = parsed.invocation;

  if (applyWithoutConfirm) {
    console.error(
      '[audit-log:backfill] --apply seen without --confirm. Running as DRY RUN.',
    );
  }

  const provider = resolveProvider();
  const driver = resolveDriver();
  const url = process.env.DATABASE_URL?.trim();

  if (provider !== 'drizzle') {
    throw new Error(
      '[audit-log:backfill] DB_PROVIDER=prisma is unsupported; AUD·C requires Drizzle.',
    );
  }
  if (driver === 'postgres' && !url) {
    throw new Error(
      '[audit-log:backfill] DATABASE_URL is required for postgres driver.',
    );
  }

  const reserved = reserveAuditBackfillArtifacts(
    decisionsPath,
    reportPath,
    process.cwd(),
  );
  const { decisionsFd, reportTmpFd } = reserved;

  const runId = randomUUID();
  const onDecision =
    decisionsFd === null
      ? undefined
      : (decision: AuditOwnershipBackfillDecision): void => {
          appendRecordDurably(decisionsFd, `${JSON.stringify(decision)}\n`);
        };

  let dbRuntime: ReturnType<typeof createDb> | undefined;
  try {
    dbRuntime = createDb({ provider, driver, url });

    console.error(
      `[audit-log:backfill] runId=${runId} mode=${mode} driver=${driver} ` +
        `batchSize=${batchSize}` +
        (settingsStartAfterId
          ? ` settingsStartAfter=${settingsStartAfterId}`
          : '') +
        (eventsStartAfterId !== null
          ? ` eventsStartAfter=${eventsStartAfterId}`
          : ''),
    );

    const report = await runAuditOwnershipBackfill(dbRuntime.db, {
      mode,
      batchSize,
      settingsStartAfterId,
      eventsStartAfterId,
      runId,
      onDecision,
    });

    const json = JSON.stringify(report, null, 2);
    process.stdout.write(`${json}\n`);
    finalizeAuditBackfillReport(reserved, json);

    console.error(
      '[audit-log:backfill] ' +
        `${mode === 'apply' ? 'APPLIED' : 'DRY RUN'} — ` +
        `settings=${JSON.stringify(report.byTable.audit_log_settings)} ` +
        `events=${JSON.stringify(report.byTable.audit_events)}`,
    );
    if (decisionsPath) {
      console.error(
        `[audit-log:backfill] Decisions streamed to ${decisionsPath}`,
      );
    }
    if (reportPath) {
      console.error(
        `[audit-log:backfill] Summary written to ${reportPath}`,
      );
    }
  } finally {
    if (decisionsFd !== null) closeSync(decisionsFd);
    if (reportTmpFd !== null) closeSync(reportTmpFd);
    await dbRuntime?.close?.();
  }
}

const isMain =
  typeof process.argv[1] === 'string' &&
  (process.argv[1].endsWith('/backfill-canonical-ownership-cli.ts') ||
    process.argv[1].endsWith('/backfill-canonical-ownership-cli.js') ||
    process.argv[1].endsWith('/backfill-canonical-ownership-cli'));

if (isMain) {
  runAuditBackfillCli().catch((error: unknown) => {
    console.error(
      '[audit-log:backfill] Fatal error:',
      error instanceof Error ? error.message : String(error),
    );
    process.exit(1);
  });
}
