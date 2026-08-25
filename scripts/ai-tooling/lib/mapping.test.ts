import { describe, expect, it } from 'vitest';

import { mapPriorityHintToNumber, mapTypeHintToLabels } from './mapping';

describe('mapTypeHintToLabels', () => {
  it('maps each allowlisted value to a single-label array', () => {
    expect(mapTypeHintToLabels('Bug')).toEqual(['Bug']);
    expect(mapTypeHintToLabels('Feature')).toEqual(['Feature']);
    expect(mapTypeHintToLabels('Improvement')).toEqual(['Improvement']);
  });

  it('returns undefined for an unrecognized value — never forwards it raw', () => {
    expect(mapTypeHintToLabels('Chore')).toBeUndefined();
    expect(mapTypeHintToLabels('bug')).toBeUndefined(); // case-sensitive, not "bug"
    expect(mapTypeHintToLabels('<script>alert(1)</script>')).toBeUndefined();
  });

  it('returns undefined when no hint was given', () => {
    expect(mapTypeHintToLabels(undefined)).toBeUndefined();
  });
});

describe('mapPriorityHintToNumber', () => {
  it('maps each canonical name to the exact Linear priority number', () => {
    expect(mapPriorityHintToNumber('Urgent')).toBe(1);
    expect(mapPriorityHintToNumber('High')).toBe(2);
    expect(mapPriorityHintToNumber('Medium')).toBe(3);
    expect(mapPriorityHintToNumber('Low')).toBe(4);
  });

  it('returns undefined for an unrecognized value — never forwards it raw', () => {
    expect(mapPriorityHintToNumber('P0')).toBeUndefined();
    expect(mapPriorityHintToNumber('urgent')).toBeUndefined(); // case-sensitive
    expect(mapPriorityHintToNumber('5')).toBeUndefined();
  });

  it('returns undefined when no hint was given', () => {
    expect(mapPriorityHintToNumber(undefined)).toBeUndefined();
  });
});
