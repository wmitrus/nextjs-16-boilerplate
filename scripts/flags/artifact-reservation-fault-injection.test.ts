import {
  chmodSync,
  closeSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { join, relative } from 'node:path';

import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import type * as FsGuardsShared from '../lib/fs-guards-shared';

/**
 * OZI-71 FF·C — exception-safety of the artifact RESERVATION phase.
 *
 * Two DETERMINISTIC fault-injection mechanisms, neither depending on the host
 * naturally producing EIO and neither an env-controlled production failure
 * mode:
 *
 *  1. a real POSIX permission fault — a parent directory `chmod`'d to `0o300`
 *     (write + search, NO read) lets `openSync(file, 'wx')` succeed but makes
 *     the subsequent `fsyncDir` (`openSync(dir, 'r')`) fail `EACCES`. This
 *     exercises the REAL `openNewWalFileWithinBase` cleanup path.
 *  2. a partial `vi.mock` of `../lib/fs-guards-shared` that makes
 *     `sameFilesystemEntry` / `pathEntryExistsWithinBase` throw on demand — for
 *     the post-acquisition `fstat` and final-`--report` `lstat` steps.
 *
 * Proves:
 *  - `openNewWalFileWithinBase` self-cleans (close fd + unlink ITS create +
 *    best-effort dir fsync + rethrow the original) when the directory fsync
 *    throws AFTER a successful `openSync` — ownership transfers only on success;
 *  - `reserveBackfillArtifacts` has ONE cleanup boundary: a throw from any
 *    post-acquisition step routes through `abort` EXACTLY once — no fd leak, no
 *    half-reservation, no pre-existing entry removed.
 */

const fault = vi.hoisted(() => ({
  /** make `sameFilesystemEntry` throw an injected error while true */
  failSameFsEntry: false,
  /** throw on the Nth `pathEntryExistsWithinBase` for a path ending with this */
  reportBasename: null as string | null,
  reportEntryChecks: 0,
  failReportEntryCheckOnCall: null as number | null,
}));

vi.mock('../load-env', () => ({}));
vi.mock('@/core/db/create-db', () => ({ createDb: vi.fn() }));

vi.mock('../lib/fs-guards-shared', async (importOriginal) => {
  const actual = await importOriginal<typeof FsGuardsShared>();
  const injected = (what: string): NodeJS.ErrnoException => {
    const e = new Error(`injected fault on ${what}`) as NodeJS.ErrnoException;
    e.code = 'EIO';
    return e;
  };
  return {
    ...actual,
    sameFilesystemEntry: (a: number, b: number): boolean => {
      if (fault.failSameFsEntry) throw injected('sameFilesystemEntry/fstat');
      return actual.sameFilesystemEntry(a, b);
    },
    pathEntryExistsWithinBase: (
      filePath: string,
      baseDir: string,
      label?: string,
    ): boolean => {
      if (
        fault.reportBasename !== null &&
        filePath.endsWith(fault.reportBasename)
      ) {
        fault.reportEntryChecks += 1;
        if (
          fault.failReportEntryCheckOnCall !== null &&
          fault.reportEntryChecks === fault.failReportEntryCheckOnCall
        ) {
          throw injected('final --report lstat re-check');
        }
      }
      return actual.pathEntryExistsWithinBase(filePath, baseDir, label);
    },
  };
});

const {
  ensureDirectorySyncWithinBase,
  openNewWalFileWithinBase,
  pathEntryExistsWithinBase,
  readTextFileWithinBase,
  writeTextFileSyncWithinBase,
} = await import('../lib/fs-guards-shared');
const { reserveBackfillArtifacts } =
  await import('./backfill-canonical-ownership');

const CWD = process.cwd();
const BASE_REL = join('node_modules', '.cache', 'ffc-fault-inject-test');
const HAS_PROC_FD = existsSync('/proc/self/fd');
// The 0o300-dir fsync fault relies on DAC enforcement — root bypasses it.
const IS_ROOT = typeof process.getuid === 'function' && process.getuid() === 0;

/** Count this process's open fds (Linux) — a deterministic fd-leak probe. */
const openFdCount = (): number =>
  HAS_PROC_FD ? readdirSync('/proc/self/fd').length : -1;

let runDir: string;
let relOf: (name: string) => string;
const noReadDirs: string[] = [];

const chmod = (dir: string, mode: number): void => {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- suite-owned scratch dir under node_modules/.cache
  chmodSync(dir, mode);
};

/** A fresh sub-directory whose fsyncDir will fail EACCES (mode 0o300). */
const makeNoReadDir = (name: string): string => {
  const dir = ensureDirectorySyncWithinBase(
    join(runDir, name),
    CWD,
    'no-read dir',
  );
  chmod(dir, 0o300);
  noReadDirs.push(dir);
  return dir;
};

beforeAll(() => {
  ensureDirectorySyncWithinBase(join(CWD, BASE_REL), CWD, 'fault-inject base');
  runDir = mkdtempSync(join(CWD, BASE_REL, 'run-'));
  relOf = (name: string) => relative(CWD, join(runDir, name));
});

beforeEach(() => {
  fault.failSameFsEntry = false;
  fault.reportBasename = null;
  fault.reportEntryChecks = 0;
  fault.failReportEntryCheckOnCall = null;
});

afterEach(() => {
  for (const dir of noReadDirs.splice(0)) {
    try {
      chmod(dir, 0o700);
    } catch {
      // best effort
    }
  }
});

afterAll(() => {
  // eslint-disable-next-line no-restricted-syntax -- suite-owned mkdtempSync dir
  rmSync(runDir, { recursive: true, force: true });
});

describe('openNewWalFileWithinBase — ownership on a post-openSync throw (finding P2)', () => {
  it.skipIf(IS_ROOT)(
    'A — openSync succeeds, directory fsync throws EACCES: rethrows, closes the fd (no leak), removes its own create, path is reusable',
    () => {
      const dir = makeNoReadDir('A');
      const target = join(dir, 'decisions.ndjson');
      const fdsBefore = openFdCount();

      expect(() => openNewWalFileWithinBase(target, CWD, 'A wal')).toThrow(
        /EACCES|permission denied/i,
      );

      if (HAS_PROC_FD) expect(openFdCount()).toBe(fdsBefore); // fd was closed
      chmod(dir, 0o700);
      expect(pathEntryExistsWithinBase(target, CWD, 'A')).toBe(false); // create removed

      const fd = openNewWalFileWithinBase(target, CWD, 'A wal 2'); // name free again
      closeSync(fd);
      expect(pathEntryExistsWithinBase(target, CWD, 'A')).toBe(true);
    },
  );
});

describe('reserveBackfillArtifacts — one cleanup boundary for every post-acquisition failure (finding P2)', () => {
  it.skipIf(IS_ROOT)(
    'B — <report>.partial dir fsync throws EACCES: the helper self-cleans <report>.partial; the single outer abort cleans the decisions WAL; no fd leak',
    () => {
      // decisions in a readable dir; <report>.partial in a 0o300 dir.
      const decisionsRel = relOf('B-d.ndjson');
      const reportDir = makeNoReadDir('B-report');
      const reportRel = relative(CWD, join(reportDir, 'r.json'));
      const fdsBefore = openFdCount();

      expect(() =>
        reserveBackfillArtifacts(decisionsRel, reportRel, CWD),
      ).toThrow(/EACCES|permission denied/i);

      if (HAS_PROC_FD) expect(openFdCount()).toBe(fdsBefore); // both fds closed
      chmod(reportDir, 0o700);
      expect(pathEntryExistsWithinBase(`${reportRel}.partial`, CWD, 't')).toBe(
        false,
      ); // helper self-cleaned
      expect(pathEntryExistsWithinBase(decisionsRel, CWD, 'd')).toBe(false); // abort cleaned
      expect(pathEntryExistsWithinBase(reportRel, CWD, 'r')).toBe(false); // never pre-created
    },
  );

  it('C — sameFilesystemEntry/fstat throws after both reservations: routes through abort once, no fd leak, both creates removed', () => {
    const decisionsRel = relOf('C-d.ndjson');
    const reportRel = relOf('C-r.json');
    const fdsBefore = openFdCount();
    fault.failSameFsEntry = true;

    expect(() =>
      reserveBackfillArtifacts(decisionsRel, reportRel, CWD),
    ).toThrow(/injected fault on sameFilesystemEntry/);

    fault.failSameFsEntry = false;
    if (HAS_PROC_FD) expect(openFdCount()).toBe(fdsBefore);
    expect(pathEntryExistsWithinBase(decisionsRel, CWD, 'd')).toBe(false);
    expect(pathEntryExistsWithinBase(`${reportRel}.partial`, CWD, 't')).toBe(
      false,
    );
    expect(pathEntryExistsWithinBase(reportRel, CWD, 'r')).toBe(false);
  });

  it('D — the final --report lstat re-check throws a non-ENOENT error after both reservations: abort runs once, no fd leak, both reservations removed', () => {
    const decisionsRel = relOf('D-d.ndjson');
    const reportRel = relOf('D-r.json');
    const fdsBefore = openFdCount();
    fault.reportBasename = 'D-r.json';
    // check #1 = step-2 pre-create existence loop; check #2 = step-5 post-reservation re-check
    fault.failReportEntryCheckOnCall = 2;

    expect(() =>
      reserveBackfillArtifacts(decisionsRel, reportRel, CWD),
    ).toThrow(/injected fault on final --report lstat/);

    fault.reportBasename = null;
    if (HAS_PROC_FD) expect(openFdCount()).toBe(fdsBefore);
    expect(pathEntryExistsWithinBase(decisionsRel, CWD, 'd')).toBe(false);
    expect(pathEntryExistsWithinBase(`${reportRel}.partial`, CWD, 't')).toBe(
      false,
    );
    expect(pathEntryExistsWithinBase(reportRel, CWD, 'r')).toBe(false);
  });

  it.skipIf(IS_ROOT)(
    'E — a pre-existing entry is never removed by a failed attempt (abort only touches THIS reservation’s creates)',
    () => {
      // E1: an unrelated pre-existing sibling in a readable dir survives an abort
      //     triggered by the decisions-WAL dir fsync.
      const keepRel = relOf('E-keepme.txt');
      writeTextFileSyncWithinBase(keepRel, CWD, 'keep\n', 'E keep fixture');
      const dDir = makeNoReadDir('E1');
      const dRel = relative(CWD, join(dDir, 'd.ndjson'));
      const rRel = relative(CWD, join(dDir, 'r.json'));

      expect(() => reserveBackfillArtifacts(dRel, rRel, CWD)).toThrow(
        /EACCES|permission denied/i,
      );

      chmod(dDir, 0o700);
      expect(pathEntryExistsWithinBase(keepRel, CWD, 'keep')).toBe(true);
      expect(pathEntryExistsWithinBase(dRel, CWD, 'd')).toBe(false);
      expect(pathEntryExistsWithinBase(`${rRel}.partial`, CWD, 't')).toBe(
        false,
      );

      // E2: a pre-existing --report is rejected by the step-2 check and left
      //     byte-intact — no create, nothing removed.
      const reportRel = relOf('E2-r.json');
      writeTextFileSyncWithinBase(
        reportRel,
        CWD,
        'prior evidence\n',
        'E2 report fixture',
      );

      expect(() =>
        reserveBackfillArtifacts(relOf('E2-d.ndjson'), reportRel, CWD),
      ).toThrow(/already exists|directory entry/i);

      expect(readTextFileWithinBase(reportRel, CWD, 'E2 report')).toBe(
        'prior evidence\n',
      );
      expect(pathEntryExistsWithinBase(relOf('E2-d.ndjson'), CWD, 'd')).toBe(
        false,
      );
    },
  );
});
