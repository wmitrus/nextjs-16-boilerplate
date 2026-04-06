// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { run } from './cli';
import type * as NewRelicLib from './lib';

type NewRelicLibModule = typeof NewRelicLib;

const { mockGetNerdGraphConfig, mockRunNrqlQuery, mockPrintResultRows } =
  vi.hoisted(() => ({
    mockGetNerdGraphConfig: vi.fn<NewRelicLibModule['getNerdGraphConfig']>(),
    mockRunNrqlQuery: vi.fn<NewRelicLibModule['runNrqlQuery']>(),
    mockPrintResultRows: vi.fn<NewRelicLibModule['printResultRows']>(),
  }));

vi.mock('./lib', async () => {
  const actual = await vi.importActual<NewRelicLibModule>('./lib');

  return {
    ...actual,
    getNerdGraphConfig: mockGetNerdGraphConfig,
    runNrqlQuery: mockRunNrqlQuery,
    printResultRows: mockPrintResultRows,
  } satisfies NewRelicLibModule;
});

describe('new-relic cli', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetNerdGraphConfig.mockReturnValue({
      accountId: 1234567,
      apiUrl: 'https://api.newrelic.com/graphql',
      userApiKey: 'NRAK_test',
    });
    mockRunNrqlQuery.mockResolvedValue([]);
  });

  it('threads the provided argv into NerdGraph config resolution', async () => {
    const argv = ['node', 'cli', 'run', 'baseline', '--account', '7654321'];

    await run(argv);

    expect(mockGetNerdGraphConfig).toHaveBeenCalledWith(argv);
  });
});
