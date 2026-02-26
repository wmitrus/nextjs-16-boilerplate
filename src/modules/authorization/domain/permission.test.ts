import { describe, expect, it } from 'vitest';

import { createAction, isAction, parseAction } from './permission';

describe('permission helpers', () => {
  it('creates action token in resource:verb format', () => {
    expect(createAction('document', 'read')).toBe('document:read');
  });

  it('normalizes empty inputs to safe defaults', () => {
    expect(createAction('', '')).toBe('system:execute');
  });

  it('validates proper action tokens', () => {
    expect(isAction('tenant:manage')).toBe(true);
    expect(isAction('tenant')).toBe(false);
    expect(isAction('tenant:')).toBe(false);
    expect(isAction(':manage')).toBe(false);
  });

  it('parses action token into resource and verb', () => {
    const parsed = parseAction('lesson:update');

    expect(parsed).toEqual({
      resource: 'lesson',
      verb: 'update',
    });
  });
});
