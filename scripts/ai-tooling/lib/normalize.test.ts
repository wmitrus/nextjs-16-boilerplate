import { describe, expect, it } from 'vitest';

import { isCanonicalId } from './id';
import { parseInbox } from './inbox-parser';
import { normalizeNewEntries } from './normalize';

const FIXED_NOW = () => new Date('2026-08-25T14:35:01.000Z');

describe('normalizeNewEntries', () => {
  it('normalizes a single NEW block into a canonical id with state/created', () => {
    const source = '## NEW\ntitle: A\nwhy: b\n';
    const { text, changed, assignedIds } = normalizeNewEntries(
      source,
      FIXED_NOW,
    );
    expect(changed).toBe(true);
    expect(assignedIds).toHaveLength(1);
    expect(isCanonicalId(assignedIds[0])).toBe(true);

    const parsed = parseInbox(text);
    expect(parsed.blocks[0].heading).toBe(assignedIds[0]);
    expect(parsed.blocks[0].fields.map((f) => f.key)).toEqual(
      expect.arrayContaining(['state', 'created', 'title', 'why']),
    );
  });

  it('normalizes multiple NEW blocks with distinct ids, preserving order', () => {
    const source = [
      '## NEW',
      'title: A',
      'why: a',
      '',
      '## NEW',
      'title: B',
      'why: b',
      '',
    ].join('\n');
    const { text, assignedIds } = normalizeNewEntries(source, FIXED_NOW);
    expect(assignedIds).toHaveLength(2);
    expect(new Set(assignedIds).size).toBe(2);

    const parsed = parseInbox(text);
    expect(parsed.blocks[0].heading).toBe(assignedIds[0]);
    expect(parsed.blocks[1].heading).toBe(assignedIds[1]);
    expect(parsed.blocks[0].fields.find((f) => f.key === 'title')?.value).toBe(
      'A',
    );
    expect(parsed.blocks[1].fields.find((f) => f.key === 'title')?.value).toBe(
      'B',
    );
  });

  it('is idempotent: re-running on already-canonical content makes no changes', () => {
    const source = '## NEW\ntitle: A\nwhy: b\n';
    const first = normalizeNewEntries(source, FIXED_NOW);
    const second = normalizeNewEntries(first.text, FIXED_NOW);
    expect(second.changed).toBe(false);
    expect(second.text).toBe(first.text);
  });

  it('leaves an already-canonical block byte-identical', () => {
    const canonical =
      '## INBOX-20260825-000000-aaaa\nstate: IMPORTED\ncreated: x\ntitle: a\nwhy: b\n';
    const { text, changed } = normalizeNewEntries(canonical, FIXED_NOW);
    expect(changed).toBe(false);
    expect(text).toBe(canonical);
  });
});
