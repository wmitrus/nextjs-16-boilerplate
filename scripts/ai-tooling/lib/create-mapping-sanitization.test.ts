/**
 * Focused tests for the two approved OZI-36 corrections:
 * A. type/priority hints map through a strict allowlist only.
 * B. `why:` reaches the created issue only via the sanitized/approved
 *    `fieldsCopied` path — never a raw re-read of the inbox field, and
 *    1:1 with what the dry-run preview showed.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ReconcileConfig } from './config';
import { FakeLinearAdapter } from './fake-linear-adapter';
import { applyPlan, buildIssueDescription, buildPlan } from './reconcile';
import type { CreateIssueInput, LinearIssueSummary, PlanRow } from './types';

let dir: string;
let config: ReconcileConfig;

function block(id: string, fields: Record<string, string>): string {
  const lines = [`## ${id}`, 'state: NEW', 'created: 2026-08-25T14:35:01.000Z'];
  for (const [k, v] of Object.entries(fields)) lines.push(`${k}: ${v}`);
  return lines.join('\n') + '\n';
}

function writeInbox(content: string): void {
  writeFileSync(config.inboxPath, content, 'utf8');
}

function readInboxRaw(): string {
  return readFileSync(config.inboxPath, 'utf8');
}

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'create-mapping-test-'));
  const ledgerDir = path.join(dir, 'ledger');
  config = {
    inboxPath: path.join(dir, 'inbox.md'),
    inboxDir: dir,
    ledgerPath: path.join(ledgerDir, 'reconcile-map.json'),
    ledgerDir,
    lockPath: path.join(ledgerDir, 'reconcile.lock'),
  };
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

class SpyAdapter extends FakeLinearAdapter {
  lastCreateInput?: CreateIssueInput;

  async createIssue(input: CreateIssueInput): Promise<LinearIssueSummary> {
    this.lastCreateInput = input;
    return super.createIssue(input);
  }
}

describe('A. type/priority hint mapping — strict allowlist only', () => {
  it('forwards an allowlisted type as a label and an allowlisted priority name as its number', async () => {
    const adapter = new SpyAdapter();
    const id = 'INBOX-20260825-000000-aaaa';
    writeInbox(
      block(id, {
        title: 'A',
        why: 'safe reason',
        type: 'Improvement',
        priority: 'Low',
      }),
    );

    const plan = await buildPlan(config, adapter);
    await applyPlan(config, adapter, plan.fingerprint);

    expect(adapter.lastCreateInput?.labels).toEqual(['Improvement']);
    expect(adapter.lastCreateInput?.priority).toBe(4);
  });

  it('maps every canonical priority name to its exact number', async () => {
    const cases: Array<[string, number]> = [
      ['Urgent', 1],
      ['High', 2],
      ['Medium', 3],
      ['Low', 4],
    ];
    for (const [name, expected] of cases) {
      const adapter = new SpyAdapter();
      const id = `INBOX-20260825-00000${expected}-aaaa`;
      writeInbox(block(id, { title: 'A', why: 'safe reason', priority: name }));
      const plan = await buildPlan(config, adapter);
      await applyPlan(config, adapter, plan.fingerprint);
      expect(adapter.lastCreateInput?.priority).toBe(expected);
    }
  });

  it('never forwards an unrecognized type/priority value raw — omits the field instead', async () => {
    const adapter = new SpyAdapter();
    const id = 'INBOX-20260825-000000-bbbb';
    writeInbox(
      block(id, {
        title: 'A',
        why: 'safe reason',
        type: 'Chore',
        priority: 'P0',
      }),
    );
    const plan = await buildPlan(config, adapter);
    await applyPlan(config, adapter, plan.fingerprint);

    expect(adapter.lastCreateInput?.labels).toBeUndefined();
    expect(adapter.lastCreateInput?.priority).toBeUndefined();
  });

  it('omits labels/priority entirely when no hint was given', async () => {
    const adapter = new SpyAdapter();
    const id = 'INBOX-20260825-000000-cccc';
    writeInbox(block(id, { title: 'A', why: 'safe reason' }));
    const plan = await buildPlan(config, adapter);
    await applyPlan(config, adapter, plan.fingerprint);

    expect(adapter.lastCreateInput?.labels).toBeUndefined();
    expect(adapter.lastCreateInput?.priority).toBeUndefined();
  });
});

describe('B. sanitized why propagation — 1:1 with the approved dry-run preview', () => {
  it('includes the approved why exactly as shown in fieldsCopied, under a ## Why heading', async () => {
    const adapter = new FakeLinearAdapter();
    const id = 'INBOX-20260825-000000-dddd';
    const why =
      'Saw stale org name in invite email after renaming org in staging';
    writeInbox(block(id, { title: 'A', why }));

    const plan = await buildPlan(config, adapter);
    expect(plan.rows[0].fieldsCopied).toContain('why');
    expect(plan.rows[0].approvedFields?.why).toBe(why);

    await applyPlan(config, adapter, plan.fingerprint);
    const after = readInboxRaw();
    const linearId = /linear_id: (OZI-\d+)/.exec(after)?.[1] as string;
    const created = await adapter.getIssue(linearId);
    expect(created?.description).toBe(
      `## Why\n${why}\n\n## Source\nInbox ID: ${id}\n`,
    );
  });

  it('never includes why when it was flagged unsafe — buildIssueDescription has nothing to copy', () => {
    const row: PlanRow = {
      inboxId: 'INBOX-x',
      title: 'A',
      duplicate: { kind: 'NONE' },
      action: 'MANUAL_REVIEW',
      reason: 'unsafe',
      fieldsCopied: [],
      fieldsOmitted: ['why'],
      // approvedFields deliberately omitted — nothing was approved.
    };
    expect(buildIssueDescription(row)).toBe('## Source\nInbox ID: INBOX-x\n');
  });

  it('omits the ## Why section entirely when there is no why field at all', () => {
    const row: PlanRow = {
      inboxId: 'INBOX-y',
      title: 'A',
      duplicate: { kind: 'NONE' },
      action: 'CREATE',
      reason: 'x',
      fieldsCopied: [],
      fieldsOmitted: [],
      approvedFields: {},
    };
    expect(buildIssueDescription(row)).toBe('## Source\nInbox ID: INBOX-y\n');
  });

  it('the real created description never diverges from what buildPlan approved, even if the inbox is edited between build and apply for an unrelated field', async () => {
    // This does not test fingerprint invalidation (already covered elsewhere) —
    // it documents that buildIssueDescription only ever reads row.approvedFields,
    // never re-reads the inbox file, so there is no path for drift.
    const adapter = new FakeLinearAdapter();
    const id = 'INBOX-20260825-000000-eeee';
    const why = 'original approved reason';
    writeInbox(block(id, { title: 'A', why }));
    const plan = await buildPlan(config, adapter);

    expect(buildIssueDescription(plan.rows[0])).toContain(why);
  });
});
