import { describe, expect, it, vi } from 'vitest';

import { findOldestObsoletePreviewBranch, readNeonConfig } from './cli';

describe('readNeonConfig', () => {
  it('validates the dedicated Neon management environment', () => {
    vi.stubEnv('NEON_API_KEY', 'secret');
    vi.stubEnv('NEON_PROJECT_ID', 'project-123');
    vi.stubEnv('NEON_BRANCH_LIMIT', '10');

    expect(readNeonConfig()).toEqual({
      apiKey: 'secret',
      branchLimit: 10,
      projectId: 'project-123',
    });

    vi.unstubAllEnvs();
  });
});

describe('findOldestObsoletePreviewBranch', () => {
  const branches = [
    {
      created_at: '2026-08-12T10:00:00Z',
      id: 'br-main',
      name: 'main',
      default: true,
    },
    {
      created_at: '2026-08-13T10:00:00Z',
      id: 'br-old-active',
      name: 'preview/feature-active',
    },
    {
      created_at: '2026-08-11T10:00:00Z',
      id: 'br-old-obsolete',
      name: 'preview/feature-closed',
    },
    {
      created_at: '2026-08-10T10:00:00Z',
      id: 'br-current',
      name: 'preview/current-feature',
    },
  ];

  it('returns only the oldest preview whose GitHub branch no longer exists', async () => {
    const branchExists = vi.fn(async (name: string) => {
      return name === 'feature-active';
    });

    await expect(
      findOldestObsoletePreviewBranch(
        branches,
        'current-feature',
        branchExists,
      ),
    ).resolves.toMatchObject({ id: 'br-old-obsolete' });
    expect(branchExists).toHaveBeenCalledWith('feature-closed');
  });

  it('does not delete an active, default, or current branch', async () => {
    await expect(
      findOldestObsoletePreviewBranch(
        branches,
        'current-feature',
        async () => true,
      ),
    ).resolves.toBeUndefined();
  });
});
