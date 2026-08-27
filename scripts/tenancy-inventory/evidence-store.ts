import { homedir } from 'node:os';
import path from 'node:path';

import {
  ensureDirectoryWithinBase,
  writeTextFileWithinBase,
} from '../lib/fs-guards-shared';

/**
 * Raw, environment-specific evidence never lives in the repo (per OZI-75's
 * evidence-storage constraint) -- it goes here instead, outside any git
 * working tree. `staging`/`production` are named for the eventual layout
 * but are not writable by this tool yet: only `local` is authorized this
 * pass (see `readonly-db.ts`'s `LocalTarget`).
 */
const EVIDENCE_ROOT = path.resolve(
  homedir(),
  '.local',
  'share',
  'nextjs-16-boilerplate',
  'ozi-75',
);

export type EvidenceEnvironment = 'local';

/**
 * Writes `content` to `<EVIDENCE_ROOT>/<environment>/<fileName>`, confined
 * to `EVIDENCE_ROOT` at the actual filesystem sink (SEC-16) -- `fileName`
 * is caller-supplied (a timestamped name built by the CLI), so confinement
 * is enforced here rather than trusted from the call site.
 */
export async function writeLocalEvidence(
  environment: EvidenceEnvironment,
  fileName: string,
  content: string,
): Promise<string> {
  const envDir = await ensureDirectoryWithinBase(
    path.resolve(EVIDENCE_ROOT, environment),
    EVIDENCE_ROOT,
    'ozi-75 evidence directory',
  );

  return writeTextFileWithinBase(
    path.resolve(envDir, fileName),
    EVIDENCE_ROOT,
    content,
    'ozi-75 evidence file',
  );
}

export function describeEvidenceRoot(): string {
  return EVIDENCE_ROOT;
}
