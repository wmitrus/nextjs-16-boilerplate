/**
 * Direct, real-behavior tests for OZI-28 test-matrix cases #10 and #11 —
 * these exercise genuine failure/concurrency conditions, not just the
 * lock/atomic-fs helpers in isolation (see also `lock.concurrency.test.ts`
 * for the real two-process case, #12).
 */
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ReconcileConfig } from './config';
import { FakeLinearAdapter } from './fake-linear-adapter';
import { applyPlan, buildPlan } from './reconcile';
import type { CreateIssueInput, LinearIssueSummary } from './types';

let dir: string;
let config: ReconcileConfig;

function canonicalNewBlock(id: string, title: string, why: string): string {
  return `## ${id}\nstate: NEW\ncreated: 2026-08-25T14:35:01.000Z\ntitle: ${title}\nwhy: ${why}\n`;
}

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'core-safety-test-'));
  const ledgerDir = path.join(dir, 'ledger');
  const inboxDir = path.join(dir, 'inbox-dir');
  mkdirSync(ledgerDir, { recursive: true });
  mkdirSync(inboxDir, { recursive: true });
  config = {
    inboxPath: path.join(inboxDir, 'inbox.md'),
    inboxDir,
    ledgerPath: path.join(ledgerDir, 'reconcile-map.json'),
    ledgerDir,
    lockPath: path.join(ledgerDir, 'reconcile.lock'),
  };
});

afterEach(() => {
  // Restore permissions before cleanup, or rmSync on a read-only dir can fail.
  try {
    chmodSync(config.inboxDir, 0o755);
  } catch {
    /* directory may already be fine or gone */
  }
  rmSync(dir, { recursive: true, force: true });
});

describe('#10 — real filesystem write failure during write-back after a confirmed ledger mapping', () => {
  it('recovers on retry via the ledger fast path with zero additional createIssue calls, no duplicate', async () => {
    const id = 'INBOX-20260825-000000-aaaa';
    writeFileSync(config.inboxPath, canonicalNewBlock(id, 'A title', 'why a'));

    let createCallCount = 0;
    const adapter = new (class extends FakeLinearAdapter {
      async createIssue(input: CreateIssueInput): Promise<LinearIssueSummary> {
        createCallCount += 1;
        return super.createIssue(input);
      }
    })();

    const plan1 = await buildPlan(config, adapter);
    expect(plan1.rows[0].action).toBe('CREATE');

    // Make the inbox directory genuinely unwritable (real fs permission
    // denial, not a mock) — the ledger directory stays writable, so the
    // ledger write succeeds but the inbox write-back must fail.
    chmodSync(config.inboxDir, 0o555);

    const result1 = await applyPlan(config, adapter, plan1.fingerprint);
    expect(result1.created).toEqual([]);
    expect(result1.failed).toHaveLength(1);
    expect(result1.failed[0].inboxId).toBe(id);
    expect(createCallCount).toBe(1); // Linear create genuinely happened once

    // The inbox file itself is untouched (write-back never landed) — still NEW.
    chmodSync(config.inboxDir, 0o755); // restore just to read it
    const afterFailure = readFileSync(config.inboxPath, 'utf8');
    expect(afterFailure).toContain('state: NEW');
    chmodSync(config.inboxDir, 0o555); // re-apply the failure condition for the retry

    // Retry with permissions still denied must NOT call createIssue again —
    // the ledger fast path resolves this as LINK_EXISTING before any Linear call.
    const plan2 = await buildPlan(config, adapter);
    expect(plan2.rows[0].action).toBe('LINK_EXISTING');
    const result2 = await applyPlan(config, adapter, plan2.fingerprint);
    expect(result2.failed).toHaveLength(1); // still fails — fs is still read-only
    expect(createCallCount).toBe(1); // NOT called again

    // Now actually restore permissions and let the write-back succeed.
    chmodSync(config.inboxDir, 0o755);
    const plan3 = await buildPlan(config, adapter);
    const result3 = await applyPlan(config, adapter, plan3.fingerprint);
    expect(result3.linked).toEqual([id]);
    expect(createCallCount).toBe(1); // never a second create across the whole recovery

    const final = readFileSync(config.inboxPath, 'utf8');
    expect(final).toContain('state: IMPORTED');
  });
});

describe('#11 — real concurrent mobile/sync append during an in-flight apply', () => {
  it('preserves a block appended mid-run and targeted-patches only the row being processed', async () => {
    const id = 'INBOX-20260825-000000-aaaa';
    writeFileSync(config.inboxPath, canonicalNewBlock(id, 'A title', 'why a'));

    const concurrentAppend =
      '\n## NEW\ntitle: Captured from phone mid-run\nwhy: simulated mobile sync landing during apply\n';

    // The append happens as a side effect of the Linear create call — i.e.
    // genuinely between buildPlan's snapshot (inside applyPlan) and this
    // row's write-back, not before the run starts.
    const adapter = new (class extends FakeLinearAdapter {
      async createIssue(input: CreateIssueInput): Promise<LinearIssueSummary> {
        const current = readFileSync(config.inboxPath, 'utf8');
        writeFileSync(config.inboxPath, current + concurrentAppend);
        return super.createIssue(input);
      }
    })();

    const plan = await buildPlan(config, adapter);
    expect(plan.rows).toHaveLength(1); // the not-yet-appended file has only one canonical entry

    const result = await applyPlan(config, adapter, plan.fingerprint);
    expect(result.created).toEqual([id]);
    expect(result.failed).toEqual([]);

    const after = readFileSync(config.inboxPath, 'utf8');
    // The original entry was correctly patched to IMPORTED...
    expect(after).toContain(`## ${id}`);
    expect(after).toContain('state: IMPORTED');
    // ...and the concurrently-appended mobile entry survived byte-for-byte,
    // untouched by the write-back that targeted only the other block.
    expect(after).toContain('## NEW\ntitle: Captured from phone mid-run');
    expect(after).toContain('why: simulated mobile sync landing during apply');
  });

  it('a second, separately normalized entry appended mid-run is untouched by the first entry write-back', async () => {
    const idA = 'INBOX-20260825-000000-aaaa';
    writeFileSync(config.inboxPath, canonicalNewBlock(idA, 'A title', 'why a'));

    const idB = 'INBOX-20260825-000000-bbbb';
    const concurrentCanonicalAppend =
      '\n' + canonicalNewBlock(idB, 'B title', 'why b');

    const adapter = new (class extends FakeLinearAdapter {
      async createIssue(input: CreateIssueInput): Promise<LinearIssueSummary> {
        if (input.title === 'A title') {
          const current = readFileSync(config.inboxPath, 'utf8');
          writeFileSync(config.inboxPath, current + concurrentCanonicalAppend);
        }
        return super.createIssue(input);
      }
    })();

    const plan = await buildPlan(config, adapter);
    expect(plan.rows).toHaveLength(1); // B does not exist yet when the plan was built

    await applyPlan(config, adapter, plan.fingerprint);

    const after = readFileSync(config.inboxPath, 'utf8');
    expect(after).toContain(`## ${idA}`);
    expect(after).toMatch(new RegExp(`## ${idA}[\\s\\S]*state: IMPORTED`));
    // B was appended after the plan/fingerprint were computed — this run
    // never touched it; it remains exactly as concurrently appended.
    expect(after).toContain(`## ${idB}`);
    expect(after).toMatch(new RegExp(`## ${idB}[\\s\\S]*state: NEW`));
    expect(after).toContain('title: B title');
  });
});
