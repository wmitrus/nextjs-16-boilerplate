import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  LedgerConflictError,
  lookupLedger,
  readLedger,
  recordConfirmedMapping,
} from './ledger';

let dir: string;
let ledgerPath: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'ledger-test-'));
  ledgerPath = path.join(dir, 'reconcile-map.json');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('readLedger', () => {
  it('returns an empty ledger when the file is missing', () => {
    expect(readLedger(ledgerPath)).toEqual({});
  });

  it('returns an empty ledger when the file is corrupted (Tier-2 fallback applies)', () => {
    writeFileSync(ledgerPath, '{not valid json');
    expect(readLedger(ledgerPath)).toEqual({});
  });

  it('parses a valid ledger file', () => {
    writeFileSync(
      ledgerPath,
      JSON.stringify({
        'INBOX-1': { linearId: 'OZI-1', action: 'create', confirmedAt: 'x' },
      }),
    );
    const ledger = readLedger(ledgerPath);
    expect(lookupLedger(ledger, 'INBOX-1')?.linearId).toBe('OZI-1');
  });
});

describe('recordConfirmedMapping', () => {
  it('writes a new confirmed mapping atomically', () => {
    const ledger = recordConfirmedMapping(ledgerPath, dir, 'INBOX-1', {
      linearId: 'OZI-40',
      action: 'create',
      confirmedAt: '2026-08-25T14:35:10.000Z',
    });
    expect(ledger['INBOX-1'].linearId).toBe('OZI-40');
    expect(readLedger(ledgerPath)['INBOX-1'].linearId).toBe('OZI-40');
  });

  it('is idempotent for an identical repeated confirmed mapping', () => {
    const entry = {
      linearId: 'OZI-40',
      action: 'create' as const,
      confirmedAt: 'x',
    };
    recordConfirmedMapping(ledgerPath, dir, 'INBOX-1', entry);
    expect(() =>
      recordConfirmedMapping(ledgerPath, dir, 'INBOX-1', entry),
    ).not.toThrow();
  });

  it('throws LedgerConflictError when a different linear_id is already recorded', () => {
    recordConfirmedMapping(ledgerPath, dir, 'INBOX-1', {
      linearId: 'OZI-40',
      action: 'create',
      confirmedAt: 'x',
    });
    expect(() =>
      recordConfirmedMapping(ledgerPath, dir, 'INBOX-1', {
        linearId: 'OZI-41',
        action: 'create',
        confirmedAt: 'y',
      }),
    ).toThrow(LedgerConflictError);
  });
});
