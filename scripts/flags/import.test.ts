vi.mock('../load-env', () => ({}));

vi.mock('@/core/db/create-db', () => ({ createDb: vi.fn() }));
vi.mock('@/modules/feature-flags/infrastructure/drizzle/schema', () => ({
  featureFlagsTable: {},
}));

import { parseFlagsJson } from './import';

describe('parseFlagsJson', () => {
  it('accepts valid array-format input and returns FlagsFile', () => {
    const input = JSON.stringify({
      flags: [
        { key: 'flag-a', enabled: true, tenantId: null },
        { key: 'flag-b', enabled: false, tenantId: 'org_123' },
      ],
    });

    const result = parseFlagsJson(input);

    expect(result.flags).toHaveLength(2);
    expect(result.flags[0]).toEqual({
      key: 'flag-a',
      enabled: true,
      tenantId: null,
    });
    expect(result.flags[1]).toEqual({
      key: 'flag-b',
      enabled: false,
      tenantId: 'org_123',
    });
  });

  it('accepts empty flags array', () => {
    const input = JSON.stringify({ flags: [] });
    const result = parseFlagsJson(input);
    expect(result.flags).toHaveLength(0);
  });

  it('throws on old object-map format with actionable message', () => {
    const oldFormat = JSON.stringify({
      flags: {
        'my-flag': { enabled: true, tenantId: null },
        'another-flag': { enabled: false, tenantId: 'org_acme' },
      },
    });

    expect(() => parseFlagsJson(oldFormat)).toThrow(
      'Old export format detected',
    );
    expect(() => parseFlagsJson(oldFormat)).toThrow(
      'pnpm flags:export --adapter=db --out=flags-backup.json',
    );
  });

  it('throws on missing top-level flags field', () => {
    const input = JSON.stringify({ data: [] });

    expect(() => parseFlagsJson(input)).toThrow(
      'missing top-level "flags" field',
    );
  });

  it('throws on non-object flags value', () => {
    const input = JSON.stringify({ flags: 'not-an-array' });

    expect(() => parseFlagsJson(input)).toThrow('"flags" must be an array');
  });

  it('throws on invalid JSON', () => {
    expect(() => parseFlagsJson('not json {')).toThrow(
      'Failed to parse input as JSON',
    );
  });

  it('throws on null input', () => {
    expect(() => parseFlagsJson('null')).toThrow(
      'missing top-level "flags" field',
    );
  });
});
