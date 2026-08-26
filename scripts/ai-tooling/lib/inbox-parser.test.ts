import { describe, expect, it } from 'vitest';

import { fieldValue, parseInbox, validateInbox } from './inbox-parser';

describe('parseInbox', () => {
  it('parses a single NEW block', () => {
    const source = '## NEW\ntitle: Fix the thing\nwhy: it broke\n';
    const parsed = parseInbox(source);
    expect(parsed.blocks).toHaveLength(1);
    expect(parsed.blocks[0].heading).toBe('NEW');
    expect(fieldValue(parsed.blocks[0], 'title')).toBe('Fix the thing');
    expect(fieldValue(parsed.blocks[0], 'why')).toBe('it broke');
  });

  it('parses multiple blocks and preserves unknown fields', () => {
    const source = [
      '## NEW',
      'title: A',
      'why: because',
      'custom_field: keep-me',
      '',
      '## NEW',
      'title: B',
      'why: also because',
      '',
    ].join('\n');
    const parsed = parseInbox(source);
    expect(parsed.blocks).toHaveLength(2);
    expect(fieldValue(parsed.blocks[0], 'custom_field')).toBe('keep-me');
    expect(fieldValue(parsed.blocks[1], 'title')).toBe('B');
  });

  it('preserves a preamble before the first heading', () => {
    const source = 'some free text\n\n## NEW\ntitle: A\nwhy: b\n';
    const parsed = parseInbox(source);
    expect(parsed.preamble).toBe('some free text\n\n');
  });

  it('tolerates non-field lines inside a block without discarding the block', () => {
    const source =
      '## NEW\ntitle: A\nfree-form note not matching key: value shape but ok\nwhy: b\n';
    const parsed = parseInbox(source);
    expect(fieldValue(parsed.blocks[0], 'title')).toBe('A');
    expect(fieldValue(parsed.blocks[0], 'why')).toBe('b');
  });
});

describe('validateInbox', () => {
  const canonicalBlock = (overrides: Record<string, string> = {}): string => {
    const fields: Record<string, string> = {
      state: 'NEW',
      created: '2026-08-25T00:00:00.000Z',
      title: 'X',
      why: 'Y',
      ...overrides,
    };
    return `## INBOX-20260825-000000-aaaa\n${Object.entries(fields)
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n')}\n`;
  };

  it('accepts a well-formed canonical block', () => {
    expect(validateInbox(parseInbox(canonicalBlock()))).toEqual([]);
  });

  it('ignores NEW blocks (not yet canonical)', () => {
    expect(validateInbox(parseInbox('## NEW\ntitle: A\nwhy: b\n'))).toEqual([]);
  });

  it('flags a malformed heading', () => {
    const errors = validateInbox(
      parseInbox(
        '## not-a-valid-id\nstate: NEW\ncreated: x\ntitle: a\nwhy: b\n',
      ),
    );
    expect(errors.some((e) => e.code === 'MALFORMED_HEADING')).toBe(true);
  });

  it('flags an invalid state', () => {
    const errors = validateInbox(
      parseInbox(canonicalBlock({ state: 'BOGUS' })),
    );
    expect(errors.some((e) => e.code === 'INVALID_STATE')).toBe(true);
  });

  it('flags a missing mandatory field', () => {
    const text =
      '## INBOX-20260825-000000-aaaa\nstate: NEW\ncreated: x\ntitle: a\n';
    const errors = validateInbox(parseInbox(text));
    expect(
      errors.some(
        (e) =>
          e.code === 'MISSING_MANDATORY_FIELD' && e.message.includes('why'),
      ),
    ).toBe(true);
  });

  it('flags duplicate canonical IDs across two blocks', () => {
    const text = canonicalBlock() + '\n' + canonicalBlock();
    const errors = validateInbox(parseInbox(text));
    expect(errors.some((e) => e.code === 'DUPLICATE_CANONICAL_ID')).toBe(true);
  });

  it('flags a duplicate singleton field within one block', () => {
    const text =
      '## INBOX-20260825-000000-aaaa\nstate: NEW\nstate: IMPORTED\ncreated: x\ntitle: a\nwhy: b\n';
    const errors = validateInbox(parseInbox(text));
    expect(errors.some((e) => e.code === 'DUPLICATE_SINGLETON_FIELD')).toBe(
      true,
    );
  });
});
