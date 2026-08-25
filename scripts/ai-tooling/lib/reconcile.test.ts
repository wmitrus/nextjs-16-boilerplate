import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ReconcileConfig } from './config';
import { sourceMarker } from './duplicate';
import { FakeLinearAdapter } from './fake-linear-adapter';
import { recordConfirmedMapping } from './ledger';
import { normalizeNewEntries } from './normalize';
import {
  ApprovalInvalidatedError,
  applyPlan,
  buildPlan,
  fingerprintRows,
  InboxValidationError,
  runNormalization,
} from './reconcile';

let dir: string;
let config: ReconcileConfig;
let adapter: FakeLinearAdapter;

function writeInbox(content: string): void {
  writeFileSync(config.inboxPath, content, 'utf8');
}

function readInboxRaw(): string {
  return readFileSync(config.inboxPath, 'utf8');
}

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'reconcile-test-'));
  const ledgerDir = path.join(dir, 'ledger');
  config = {
    inboxPath: path.join(dir, 'inbox.md'),
    inboxDir: dir,
    ledgerPath: path.join(ledgerDir, 'reconcile-map.json'),
    ledgerDir,
    lockPath: path.join(ledgerDir, 'reconcile.lock'),
  };
  adapter = new FakeLinearAdapter();
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function canonicalNewBlock(
  id: string,
  title: string,
  why: string,
  extra = '',
): string {
  return `## ${id}\nstate: NEW\ncreated: 2026-08-25T14:35:01.000Z\ntitle: ${title}\nwhy: ${why}\n${extra}`;
}

describe('runNormalization', () => {
  it('normalizes ## NEW blocks and writes back atomically', () => {
    writeInbox('## NEW\ntitle: A\nwhy: a\n');
    const result = runNormalization(config);
    expect(result.changed).toBe(true);
    expect(result.assignedIds).toHaveLength(1);
    expect(readInboxRaw()).toContain(`## ${result.assignedIds[0]}`);
  });

  it('is idempotent on an already-canonical file', () => {
    writeInbox(canonicalNewBlock('INBOX-20260825-000000-aaaa', 'A', 'a'));
    const before = readInboxRaw();
    const result = runNormalization(config);
    expect(result.changed).toBe(false);
    expect(readInboxRaw()).toBe(before);
  });
});

describe('buildPlan', () => {
  it('rejects a file with fatal parse errors', async () => {
    writeInbox('## not-canonical\nstate: NEW\n');
    await expect(buildPlan(config, adapter)).rejects.toBeInstanceOf(
      InboxValidationError,
    );
  });

  it('plans CREATE for a NEW entry with no existing Linear match', async () => {
    writeInbox(
      canonicalNewBlock('INBOX-20260825-000000-aaaa', 'A title', 'why a'),
    );
    const plan = await buildPlan(config, adapter);
    expect(plan.rows).toHaveLength(1);
    expect(plan.rows[0].action).toBe('CREATE');
  });

  it('plans LINK_EXISTING when a verified Linear match already exists', async () => {
    const id = 'INBOX-20260825-000000-aaaa';
    adapter.seed({
      id: 'OZI-50',
      title: 'x',
      description: `## Source\n${sourceMarker(id)}`,
    });
    writeInbox(canonicalNewBlock(id, 'A title', 'why a'));
    const plan = await buildPlan(config, adapter);
    expect(plan.rows[0].action).toBe('LINK_EXISTING');
  });

  it('plans MANUAL_REVIEW for sensitive content and never copies it into fieldsCopied', async () => {
    writeInbox(
      canonicalNewBlock(
        'INBOX-20260825-000000-aaaa',
        'A title',
        'password: hunter2',
      ),
    );
    const plan = await buildPlan(config, adapter);
    expect(plan.rows[0].action).toBe('MANUAL_REVIEW');
    expect(plan.rows[0].fieldsCopied).toEqual([]);
  });

  it('plans MANUAL_REVIEW when the exact Inbox ID matches more than one Linear issue', async () => {
    const id = 'INBOX-20260825-000000-aaaa';
    const marker = `## Source\n${sourceMarker(id)}`;
    adapter.seed({ id: 'OZI-50', title: 'x', description: marker });
    adapter.seed({ id: 'OZI-51', title: 'y', description: marker });
    writeInbox(canonicalNewBlock(id, 'A title', 'why a'));
    const plan = await buildPlan(config, adapter);
    expect(plan.rows[0].action).toBe('MANUAL_REVIEW');
  });

  it('never issues a Linear mutation while building a plan (dry-run performs zero mutations)', async () => {
    let createCalled = false;
    const spy = new (class extends FakeLinearAdapter {
      async createIssue(
        input: Parameters<FakeLinearAdapter['createIssue']>[0],
      ) {
        createCalled = true;
        return super.createIssue(input);
      }
    })();
    writeInbox(canonicalNewBlock('INBOX-20260825-000000-aaaa', 'A', 'a'));
    await buildPlan(config, spy);
    expect(createCalled).toBe(false);
  });

  it('does not plan already-IMPORTED entries (no-op)', async () => {
    writeInbox(
      '## INBOX-20260825-000000-aaaa\nstate: IMPORTED\ncreated: x\ntitle: A\nwhy: a\nlinear_id: OZI-1\nimported: y\n',
    );
    const plan = await buildPlan(config, adapter);
    expect(plan.rows).toHaveLength(0);
  });
});

describe('applyPlan', () => {
  it('creates a new Linear issue, records the ledger, and writes IMPORTED back to the inbox', async () => {
    const id = 'INBOX-20260825-000000-aaaa';
    writeInbox(canonicalNewBlock(id, 'A title', 'why a'));
    const plan = await buildPlan(config, adapter);

    const result = await applyPlan(config, adapter, plan.fingerprint);
    expect(result.created).toEqual([id]);
    expect(result.failed).toEqual([]);

    const after = readInboxRaw();
    expect(after).toContain('state: IMPORTED');
    expect(after).toMatch(/linear_id: OZI-\d+/);

    const linearId = /linear_id: (OZI-\d+)/.exec(after)?.[1];
    expect(linearId).toBeDefined();
    const createdIssue = await adapter.getIssue(linearId as string);
    expect(createdIssue?.description).toContain(sourceMarker(id));
  });

  it('links an existing issue instead of creating a duplicate', async () => {
    const id = 'INBOX-20260825-000000-aaaa';
    adapter.seed({
      id: 'OZI-77',
      title: 'x',
      description: `## Source\n${sourceMarker(id)}`,
    });
    writeInbox(canonicalNewBlock(id, 'A title', 'why a'));
    const plan = await buildPlan(config, adapter);

    const result = await applyPlan(config, adapter, plan.fingerprint);
    expect(result.linked).toEqual([id]);
    expect(result.created).toEqual([]);
    expect(readInboxRaw()).toContain('linear_id: OZI-77');
  });

  it('rejects applying a stale plan whose fingerprint no longer matches current state', async () => {
    const id = 'INBOX-20260825-000000-aaaa';
    writeInbox(canonicalNewBlock(id, 'Original title', 'why a'));
    const plan = await buildPlan(config, adapter);

    // Simulate a concurrent edit (e.g. mobile sync) changing the entry after dry-run.
    writeInbox(canonicalNewBlock(id, 'Changed title', 'why a'));

    await expect(
      applyPlan(config, adapter, plan.fingerprint),
    ).rejects.toBeInstanceOf(ApprovalInvalidatedError);
  });

  it('recovers via the ledger fast path when create succeeded but write-back was missing (crash-window recovery)', async () => {
    const id = 'INBOX-20260825-000000-aaaa';
    writeInbox(canonicalNewBlock(id, 'A title', 'why a'));

    // Simulate Case D: a prior run's createIssue succeeded and its ledger
    // write was confirmed, but the process crashed before the inbox
    // write-back happened. Seed the Linear-side issue too (it really was
    // created), and the ledger, but leave the inbox entry at state: NEW.
    adapter.seed({
      id: 'OZI-99',
      title: 'A title',
      description: `## Source\n${sourceMarker(id)}`,
    });
    recordConfirmedMapping(config.ledgerPath, config.ledgerDir, id, {
      linearId: 'OZI-99',
      action: 'create',
      confirmedAt: '2026-08-25T14:36:00.000Z',
    });

    let createCalled = false;
    const spy = new (class extends FakeLinearAdapter {
      async createIssue(
        input: Parameters<FakeLinearAdapter['createIssue']>[0],
      ) {
        createCalled = true;
        return adapter.createIssue(input);
      }
      async searchCandidates(q: string) {
        return adapter.searchCandidates(q);
      }
      async getIssue(i: string) {
        return adapter.getIssue(i);
      }
    })();

    const plan = await buildPlan(config, spy);
    // The ledger fast path means this is resolved as LINK_EXISTING, not CREATE.
    expect(plan.rows[0].action).toBe('LINK_EXISTING');

    const result = await applyPlan(config, spy, plan.fingerprint);
    expect(result.linked).toEqual([id]);
    expect(createCalled).toBe(false); // recovery never re-calls createIssue
    expect(readInboxRaw()).toContain('linear_id: OZI-99');
    expect(readInboxRaw()).toContain('state: IMPORTED');
  });

  it('refuses write-back when the block content changes while its own mutation is in flight', async () => {
    // Regression: buildPlan captures blockFingerprint once at the top of
    // applyPlan; a race window still exists between that read and the
    // per-row write-back, which runs after the (awaited) Linear call. A
    // state-only check would miss a same-block edit landing in that window
    // and would mark the edited entry IMPORTED with stale content.
    const id = 'INBOX-20260825-000000-aaaa';
    writeInbox(canonicalNewBlock(id, 'Original title', 'why a'));
    const plan = await buildPlan(config, adapter);

    const racingDuringCreate = new (class extends FakeLinearAdapter {
      async createIssue(
        input: Parameters<FakeLinearAdapter['createIssue']>[0],
      ) {
        // Simulate an edit (e.g. mobile sync) landing on this exact block
        // after buildPlan's read but before this row's write-back re-reads.
        writeInbox(canonicalNewBlock(id, 'Changed mid-flight', 'why a'));
        return super.createIssue(input);
      }
    })();

    const result = await applyPlan(
      config,
      racingDuringCreate,
      plan.fingerprint,
    );
    expect(result.created).toEqual([]);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].inboxId).toBe(id);

    const after = readInboxRaw();
    expect(after).toContain('title: Changed mid-flight'); // not clobbered
    expect(after).not.toContain('state: IMPORTED');
  });

  it('preserves an unrelated block byte-for-byte while writing back a different entry', async () => {
    const idA = 'INBOX-20260825-000000-aaaa';
    const idB = 'INBOX-20260825-000000-bbbb';
    writeInbox(
      canonicalNewBlock(idA, 'A title', 'why a') +
        '\n' +
        canonicalNewBlock(idB, 'B title', 'why b'),
    );
    const plan = await buildPlan(config, adapter);
    expect(plan.rows).toHaveLength(2);

    await applyPlan(config, adapter, plan.fingerprint);

    const after = readInboxRaw();
    expect(after).toContain('title: A title');
    expect(after).toContain('title: B title');
    expect((after.match(/state: IMPORTED/g) ?? []).length).toBe(2);
  });

  it('never re-processes an already-IMPORTED entry', async () => {
    writeInbox(
      '## INBOX-20260825-000000-aaaa\nstate: IMPORTED\ncreated: x\ntitle: A\nwhy: a\nlinear_id: OZI-5\nimported: y\n',
    );
    const plan = await buildPlan(config, adapter);
    const result = await applyPlan(config, adapter, plan.fingerprint);
    expect(result.created).toEqual([]);
    expect(result.linked).toEqual([]);
  });
});

describe('fingerprintRows', () => {
  it('is stable for identical rows and changes when rows differ', () => {
    const rowsA = [
      {
        inboxId: 'INBOX-1',
        title: 'A',
        duplicate: { kind: 'NONE' as const },
        action: 'CREATE' as const,
        reason: 'x',
        fieldsCopied: [],
        fieldsOmitted: [],
        blockFingerprint: 'fp-1',
      },
    ];
    const rowsB = [{ ...rowsA[0], title: 'Changed' }];
    expect(fingerprintRows(rowsA)).toBe(fingerprintRows(rowsA));
    expect(fingerprintRows(rowsA)).not.toBe(fingerprintRows(rowsB));
  });

  it('changes when an approved free-text field (e.g. why) changes, even though inboxId/action/title/duplicate stay the same', () => {
    const base = {
      inboxId: 'INBOX-1',
      title: 'A',
      duplicate: { kind: 'NONE' as const },
      action: 'CREATE' as const,
      reason: 'x',
      fieldsCopied: ['why'],
      fieldsOmitted: [],
      blockFingerprint: 'fp-1',
      approvedFields: { why: 'original reason' },
    };
    const changed = { ...base, approvedFields: { why: 'different reason' } };
    expect(fingerprintRows([base])).not.toBe(fingerprintRows([changed]));
  });

  it('changes when a LINK_EXISTING row resolves to a different Linear issue, even though duplicate.kind stays ONE', () => {
    const base = {
      inboxId: 'INBOX-1',
      title: 'A',
      duplicate: {
        kind: 'ONE' as const,
        linearId: 'OZI-1',
        source: 'LEDGER' as const,
      },
      action: 'LINK_EXISTING' as const,
      reason: 'x',
      fieldsCopied: [],
      fieldsOmitted: [],
      blockFingerprint: 'fp-1',
    };
    const retargeted = {
      ...base,
      duplicate: {
        kind: 'ONE' as const,
        linearId: 'OZI-2',
        source: 'LEDGER' as const,
      },
    };
    expect(fingerprintRows([base])).not.toBe(fingerprintRows([retargeted]));
  });
});

describe('normalizeNewEntries integration with buildPlan', () => {
  it('a NEW-form entry is invisible to buildPlan until normalized', async () => {
    writeInbox('## NEW\ntitle: A\nwhy: a\n');
    const plan = await buildPlan(config, adapter);
    expect(plan.rows).toHaveLength(0); // not yet canonical, correctly skipped

    const { text } = normalizeNewEntries(readInboxRaw());
    writeInbox(text);
    const planAfter = await buildPlan(config, adapter);
    expect(planAfter.rows).toHaveLength(1);
  });
});
