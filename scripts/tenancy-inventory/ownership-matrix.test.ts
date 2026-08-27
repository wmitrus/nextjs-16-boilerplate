import { describe, expect, it } from 'vitest';

import { TABLE_OWNERSHIP, summarizeOwnership } from './ownership-matrix';

describe('TABLE_OWNERSHIP', () => {
  it('has no duplicate table names', () => {
    const names = TABLE_OWNERSHIP.map((row) => row.table);
    expect(new Set(names).size).toBe(names.length);
  });

  it('gives every ambiguous row a non-empty rationale explaining the anomaly', () => {
    for (const row of TABLE_OWNERSHIP) {
      if (row.owner === 'ambiguous') {
        expect(row.rationale.length).toBeGreaterThan(20);
      }
    }
  });

  it('gives a null scopeColumn only to platform-owned tables', () => {
    for (const row of TABLE_OWNERSHIP) {
      if (row.scopeColumn === null) {
        expect(row.owner).toBe('platform');
      }
    }
  });
});

describe('summarizeOwnership', () => {
  it('counts match the table length', () => {
    const summary = summarizeOwnership();
    const total = Object.values(summary).reduce((a, b) => a + b, 0);
    expect(total).toBe(TABLE_OWNERSHIP.length);
  });
});
