import { describe, expect, it } from 'vitest';

import { parseInbox } from './inbox-parser';
import { patchBlockFields, patchNormalizeBlock } from './patch';

describe('patchBlockFields', () => {
  it('updates an existing field in place without touching other blocks', () => {
    const source = [
      '## INBOX-20260825-000000-aaaa',
      'state: NEW',
      'created: x',
      'title: A',
      'why: a',
      '',
      '## INBOX-20260825-000000-bbbb',
      'state: NEW',
      'created: y',
      'title: B',
      'why: b',
      '',
    ].join('\n');
    const parsed = parseInbox(source);
    const patched = patchBlockFields(source, parsed.blocks[0], {
      state: 'IMPORTED',
    });

    expect(patched).toContain('## INBOX-20260825-000000-aaaa\nstate: IMPORTED');
    // The second, unrelated block is byte-preserved.
    const secondBlockOriginal = source.slice(
      parsed.blocks[1].start,
      parsed.blocks[1].end,
    );
    expect(patched).toContain(secondBlockOriginal);
  });

  it('appends a field that does not yet exist in the block', () => {
    const source =
      '## INBOX-20260825-000000-aaaa\nstate: NEW\ncreated: x\ntitle: A\nwhy: a\n';
    const parsed = parseInbox(source);
    const patched = patchBlockFields(source, parsed.blocks[0], {
      linear_id: 'OZI-40',
      imported: '2026-08-25T15:00:00.000Z',
    });
    expect(patched).toContain('linear_id: OZI-40');
    expect(patched).toContain('imported: 2026-08-25T15:00:00.000Z');
    // Original fields untouched.
    expect(patched).toContain('title: A');
  });
});

describe('patchNormalizeBlock', () => {
  it('rewrites the heading and inserts state/created ahead of existing fields', () => {
    const source = '## NEW\ntitle: A\nwhy: a\n';
    const parsed = parseInbox(source);
    const patched = patchNormalizeBlock(
      source,
      parsed.blocks[0],
      'INBOX-20260825-143501-a1b2',
      '2026-08-25T14:35:01.000Z',
    );
    expect(patched).toBe(
      '## INBOX-20260825-143501-a1b2\nstate: NEW\ncreated: 2026-08-25T14:35:01.000Z\ntitle: A\nwhy: a\n',
    );
  });
});
