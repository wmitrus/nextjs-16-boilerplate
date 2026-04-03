vi.mock('../load-env', () => ({}));

vi.mock('@/core/db/create-db', () => ({ createDb: vi.fn() }));
vi.mock('@/modules/feature-flags/infrastructure/drizzle/schema', () => ({
  featureFlagsTable: {},
}));
vi.mock(
  '@/modules/feature-flags/infrastructure/static/StaticFeatureFlagService',
  () => ({
    parseStaticFlagsEnv: (raw: string | undefined) => {
      if (!raw) return {};
      return Object.fromEntries(
        raw.split(',').map((pair) => {
          const [k, v] = pair.split('=');
          return [k, v === 'true'];
        }),
      );
    },
  }),
);

import { readStaticFlags, writeToStaticFormat } from './migrate';

describe('readStaticFlags', () => {
  it('returns empty flags array when FEATURE_FLAGS_STATIC is unset', () => {
    delete process.env.FEATURE_FLAGS_STATIC;
    const result = readStaticFlags();
    expect(result).toEqual({ flags: [] });
  });

  it('parses FEATURE_FLAGS_STATIC into array of flag entries', () => {
    process.env.FEATURE_FLAGS_STATIC = 'flag-a=true,flag-b=false';
    const result = readStaticFlags();
    expect(result.flags).toHaveLength(2);
    expect(result.flags).toContainEqual({
      key: 'flag-a',
      enabled: true,
      tenantId: null,
    });
    expect(result.flags).toContainEqual({
      key: 'flag-b',
      enabled: false,
      tenantId: null,
    });
    delete process.env.FEATURE_FLAGS_STATIC;
  });
});

describe('writeToStaticFormat', () => {
  it('writes FEATURE_FLAGS_STATIC line to stdout for global flags', () => {
    const writeSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    writeToStaticFormat({
      flags: [
        { key: 'flag-x', enabled: true, tenantId: null },
        { key: 'flag-y', enabled: false, tenantId: null },
      ],
    });

    expect(writeSpy).toHaveBeenCalledWith(
      expect.stringContaining('FEATURE_FLAGS_STATIC='),
    );
    expect(writeSpy).toHaveBeenCalledWith(
      expect.stringContaining('flag-x=true'),
    );
    expect(writeSpy).toHaveBeenCalledWith(
      expect.stringContaining('flag-y=false'),
    );

    writeSpy.mockRestore();
  });

  it('skips tenant-scoped flags in output', () => {
    const writeSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    writeToStaticFormat({
      flags: [
        { key: 'global-flag', enabled: true, tenantId: null },
        { key: 'tenant-flag', enabled: true, tenantId: 'acme' },
      ],
    });

    const output = (writeSpy.mock.calls[0]?.[0] as string) ?? '';
    expect(output).toContain('global-flag=true');
    expect(output).not.toContain('tenant-flag');

    writeSpy.mockRestore();
  });

  it('preserves both global and tenant entries independently in the flags array', () => {
    const data = {
      flags: [
        { key: 'my-feature', enabled: true, tenantId: null },
        { key: 'my-feature', enabled: false, tenantId: 'org_123' },
      ],
    };

    expect(data.flags).toHaveLength(2);

    const writeSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    writeToStaticFormat(data);

    const output = (writeSpy.mock.calls[0]?.[0] as string) ?? '';
    expect(output).toContain('my-feature=true');
    expect(output).not.toContain('org_123');

    writeSpy.mockRestore();
  });
});
