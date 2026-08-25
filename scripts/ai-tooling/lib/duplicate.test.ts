import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resolveDuplicate, sourceMarker, verifiedSearch } from './duplicate';
import { FakeLinearAdapter } from './fake-linear-adapter';
import { recordConfirmedMapping } from './ledger';

let dir: string;
let ledgerPath: string;
let adapter: FakeLinearAdapter;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'duplicate-test-'));
  ledgerPath = path.join(dir, 'reconcile-map.json');
  adapter = new FakeLinearAdapter();
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('verifiedSearch', () => {
  it('returns NONE when no issue carries the exact source marker', async () => {
    adapter.seed({
      id: 'OZI-1',
      title: 'unrelated',
      description: 'nothing here',
    });
    expect(await verifiedSearch('INBOX-20260825-143501-a1b2', adapter)).toEqual(
      { kind: 'NONE' },
    );
  });

  it('reproduces the empirical false-positive shape but still verifies down to exactly one', async () => {
    // Same shape as the real observed case: several sibling issues share date
    // tokens in their descriptions, but only one carries the literal marker.
    adapter.seed({
      id: 'OZI-25',
      title: 'sibling',
      description: 'discussion of 20260825 work',
    });
    adapter.seed({
      id: 'OZI-26',
      title: 'sibling',
      description: 'also 143501 something',
    });
    adapter.seed({
      id: 'OZI-27',
      title: 'the real one',
      description: `## Source\n${sourceMarker('INBOX-20260825-143501-a1b2')}`,
    });

    const id = 'INBOX-20260825-143501-a1b2';
    const rawCandidates = await adapter.searchCandidates(id);
    // The coarse search alone is NOT exact — it returns more than the one real match.
    expect(rawCandidates.length).toBeGreaterThan(1);

    const resolution = await verifiedSearch(id, adapter);
    expect(resolution).toEqual({
      kind: 'ONE',
      linearId: 'OZI-27',
      source: 'VERIFIED_SEARCH',
    });
  });

  it('returns AMBIGUOUS when more than one issue carries the exact marker', async () => {
    const marker = sourceMarker('INBOX-20260825-143501-a1b2');
    adapter.seed({
      id: 'OZI-27',
      title: 'a',
      description: `## Source\n${marker}`,
    });
    adapter.seed({
      id: 'OZI-28',
      title: 'b',
      description: `## Source\n${marker}`,
    });

    const resolution = await verifiedSearch(
      'INBOX-20260825-143501-a1b2',
      adapter,
    );
    expect(resolution.kind).toBe('AMBIGUOUS');
    if (resolution.kind === 'AMBIGUOUS') {
      expect(resolution.candidates.sort()).toEqual(['OZI-27', 'OZI-28']);
    }
  });
});

describe('resolveDuplicate', () => {
  it('uses the ledger fast path without calling Linear search when a confirmed mapping exists', async () => {
    recordConfirmedMapping(ledgerPath, dir, 'INBOX-1', {
      linearId: 'OZI-99',
      action: 'create',
      confirmedAt: 'x',
    });
    let searchCalled = false;
    const spyAdapter = new (class extends FakeLinearAdapter {
      async searchCandidates(query: string) {
        searchCalled = true;
        return super.searchCandidates(query);
      }
    })();

    const resolution = await resolveDuplicate(
      'INBOX-1',
      ledgerPath,
      dir,
      spyAdapter,
    );
    expect(resolution).toEqual({
      kind: 'ONE',
      linearId: 'OZI-99',
      source: 'LEDGER',
    });
    expect(searchCalled).toBe(false);
  });

  it('falls back to verified search when the ledger has no entry', async () => {
    adapter.seed({
      id: 'OZI-30',
      title: 'x',
      description: `## Source\n${sourceMarker('INBOX-2')}`,
    });
    const resolution = await resolveDuplicate(
      'INBOX-2',
      ledgerPath,
      dir,
      adapter,
    );
    expect(resolution).toEqual({
      kind: 'ONE',
      linearId: 'OZI-30',
      source: 'VERIFIED_SEARCH',
    });
  });
});
