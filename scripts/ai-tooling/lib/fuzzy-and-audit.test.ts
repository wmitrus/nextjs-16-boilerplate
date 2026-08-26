import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ReconcileConfig } from './config';
import { fuzzyTitleWarning, sourceMarker } from './duplicate';
import { FakeLinearAdapter } from './fake-linear-adapter';
import { buildPlan, verifyImportedEntries } from './reconcile';

describe('fuzzyTitleWarning', () => {
  it('warns (without blocking) when a similarly-titled issue exists that is not the exact match', async () => {
    const adapter = new FakeLinearAdapter();
    adapter.seed({
      id: 'OZI-12',
      title: 'Admin org rename breaks invite email caching',
      description: 'unrelated description, no source marker',
    });
    const warning = await fuzzyTitleWarning(
      'INBOX-x',
      'Admin org rename does not bust invite-email caching',
      adapter,
      undefined,
    );
    expect(warning).toContain('OZI-12');
  });

  it('does not warn about the issue that is already the exact-ID match', async () => {
    const adapter = new FakeLinearAdapter();
    adapter.seed({
      id: 'OZI-12',
      title: 'Same title here for real',
      description: '',
    });
    const warning = await fuzzyTitleWarning(
      'INBOX-x',
      'Same title here for real',
      adapter,
      'OZI-12',
    );
    expect(warning).toBeUndefined();
  });

  it('returns no warning when nothing is similar', async () => {
    const adapter = new FakeLinearAdapter();
    adapter.seed({
      id: 'OZI-12',
      title: 'completely unrelated topic',
      description: '',
    });
    const warning = await fuzzyTitleWarning(
      'INBOX-x',
      'Admin org rename bug',
      adapter,
      undefined,
    );
    expect(warning).toBeUndefined();
  });
});

describe('buildPlan integration with fuzzyTitleWarning', () => {
  let dir: string;
  let config: ReconcileConfig;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'fuzzy-plan-test-'));
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

  it('attaches a fuzzyWarning to a CREATE row without changing its action', async () => {
    const adapter = new FakeLinearAdapter();
    adapter.seed({
      id: 'OZI-12',
      title: 'Admin org rename cache bug',
      description: 'no marker',
    });
    writeFileSync(
      config.inboxPath,
      '## INBOX-20260825-000000-aaaa\nstate: NEW\ncreated: x\ntitle: Admin org rename cache bug fix\nwhy: y\n',
    );
    const plan = await buildPlan(config, adapter);
    expect(plan.rows[0].action).toBe('CREATE');
    expect(plan.rows[0].fuzzyWarning).toContain('OZI-12');
  });
});

describe('verifyImportedEntries (Case F consistency audit)', () => {
  let dir: string;
  let config: ReconcileConfig;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'verify-imported-test-'));
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

  it('reports no issues when every IMPORTED entry resolves', async () => {
    const adapter = new FakeLinearAdapter();
    adapter.seed({
      id: 'OZI-5',
      title: 'x',
      description: `## Source\n${sourceMarker('INBOX-a')}`,
    });
    writeFileSync(
      config.inboxPath,
      '## INBOX-a\nstate: IMPORTED\ncreated: x\ntitle: A\nwhy: a\nlinear_id: OZI-5\nimported: y\n',
    );
    expect(await verifyImportedEntries(config, adapter)).toEqual([]);
  });

  it('flags an IMPORTED entry whose linear_id no longer resolves (Case F)', async () => {
    const adapter = new FakeLinearAdapter(); // nothing seeded — OZI-999 will not be found
    writeFileSync(
      config.inboxPath,
      '## INBOX-b\nstate: IMPORTED\ncreated: x\ntitle: B\nwhy: b\nlinear_id: OZI-999\nimported: y\n',
    );
    const issues = await verifyImportedEntries(config, adapter);
    expect(issues).toEqual([
      {
        inboxId: 'INBOX-b',
        linearId: 'OZI-999',
        reason: expect.stringContaining('could not be found'),
      },
    ]);
  });

  it('ignores NEW/DEFERRED/REJECTED entries entirely', async () => {
    const adapter = new FakeLinearAdapter();
    writeFileSync(
      config.inboxPath,
      '## INBOX-c\nstate: NEW\ncreated: x\ntitle: C\nwhy: c\n',
    );
    expect(await verifyImportedEntries(config, adapter)).toEqual([]);
  });
});
