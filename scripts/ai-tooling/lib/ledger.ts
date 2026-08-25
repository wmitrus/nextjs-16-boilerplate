/**
 * Local, durable ledger — atomically-replaced JSON map of confirmed
 * `inboxId -> { linearId, action, confirmedAt }` mappings (OZI-28 §Ledger
 * model). Fast-path recovery only; never a distributed transaction — the
 * authoritative safety net is Tier-2 verified Linear search
 * (see `duplicate.ts`), not this file.
 *
 * Stored local-only: outside git, outside the synced inbox storage.
 */

import {
  pathExistsWithinBase,
  readTextFileWithinBase,
} from '../../lib/fs-guards-shared';

import { atomicWriteWithinBase } from './atomic-fs';
import type { Ledger, LedgerEntry } from './types';

export class LedgerConflictError extends Error {
  constructor(inboxId: string, existing: string, incoming: string) {
    super(
      `Ledger consistency error for ${inboxId}: existing linear_id "${existing}" ` +
        `differs from incoming "${incoming}". Manual review required.`,
    );
    this.name = 'LedgerConflictError';
  }
}

/**
 * Reads the ledger; missing or corrupted file is treated as an empty ledger
 * (Tier-2 fallback applies). `ledgerPath` is confined to `ledgerDir` at the
 * read sink itself — a bare `path.resolve()` normalizes but does not confine.
 */
export function readLedger(ledgerPath: string, ledgerDir: string): Ledger {
  if (!pathExistsWithinBase(ledgerPath, ledgerDir, 'ledger')) return {};
  try {
    const raw = readTextFileWithinBase(ledgerPath, ledgerDir, 'ledger');
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Ledger;
    }
    return {};
  } catch {
    // Corrupted ledger — recovery falls back to Tier-2 verified search.
    return {};
  }
}

export function lookupLedger(
  ledger: Ledger,
  inboxId: string,
): LedgerEntry | undefined {
  return ledger[inboxId];
}

/**
 * Record a confirmed mapping. Throws `LedgerConflictError` if a different
 * `linearId` is already recorded for this `inboxId` — never silently
 * overwritten.
 */
export function recordConfirmedMapping(
  ledgerPath: string,
  ledgerDir: string,
  inboxId: string,
  entry: LedgerEntry,
): Ledger {
  const current = readLedger(ledgerPath, ledgerDir);
  const existing = current[inboxId];
  if (existing && existing.linearId !== entry.linearId) {
    throw new LedgerConflictError(inboxId, existing.linearId, entry.linearId);
  }
  const next: Ledger = { ...current, [inboxId]: entry };
  atomicWriteWithinBase(
    ledgerPath,
    ledgerDir,
    `${JSON.stringify(next, null, 2)}\n`,
    'ledger',
  );
  return next;
}
