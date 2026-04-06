// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as LeantimeCatalog from './catalog';
import { run } from './cli';
import type * as LeantimeLib from './lib';

type LeantimeLibModule = typeof LeantimeLib;
type LeantimeCatalogModule = typeof LeantimeCatalog;

const {
  mockExecuteOperation,
  mockGetLeantimeConfig,
  mockGetOperation,
  mockReadStructuredInput,
} = vi.hoisted(() => ({
  mockExecuteOperation: vi.fn<LeantimeCatalogModule['executeOperation']>(),
  mockGetLeantimeConfig: vi.fn<LeantimeLibModule['getLeantimeConfig']>(),
  mockGetOperation: vi.fn<LeantimeCatalogModule['getOperation']>(),
  mockReadStructuredInput: vi.fn<LeantimeLibModule['readStructuredInput']>(),
}));

vi.mock('./catalog', async () => {
  const actual = await vi.importActual<LeantimeCatalogModule>('./catalog');

  return {
    ...actual,
    executeOperation: mockExecuteOperation,
    getOperation: mockGetOperation,
  } satisfies LeantimeCatalogModule;
});

vi.mock('./lib', async () => {
  const actual = await vi.importActual<LeantimeLibModule>('./lib');

  return {
    ...actual,
    getLeantimeConfig: mockGetLeantimeConfig,
    readStructuredInput: mockReadStructuredInput,
  } satisfies LeantimeLibModule;
});

describe('leantime cli', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetLeantimeConfig.mockReturnValue({
      apiKey: 'lt_example',
      baseUrl: 'https://leantime.example.com/',
      defaultAuthorId: 12,
      defaultClientId: 34,
      defaultProjectId: 56,
      rpcUrl: 'https://leantime.example.com/api/jsonrpc',
      timeoutMs: 30000,
    });
    mockGetOperation.mockReturnValue({
      category: 'tasks',
      description: 'Create a task.',
      execute: async () => 123,
      id: 'task.create',
      title: 'Create Task',
    });
    mockReadStructuredInput.mockReturnValue({ headline: 'Kickoff' });
    mockExecuteOperation.mockResolvedValue({ id: 123 });
  });

  it('threads argv-derived config and input into operation execution', async () => {
    const argv = [
      'node',
      'cli',
      'run',
      'task.create',
      '--project',
      '99',
      '--input',
      '{"headline":"Kickoff"}',
    ];

    await run(argv);

    expect(mockGetLeantimeConfig).toHaveBeenCalledWith(argv);
    expect(mockReadStructuredInput).toHaveBeenCalledWith(argv);
    expect(mockExecuteOperation).toHaveBeenCalledWith('task.create', {
      config: expect.objectContaining({
        rpcUrl: 'https://leantime.example.com/api/jsonrpc',
      }),
      input: { headline: 'Kickoff' },
    });
  });
});
