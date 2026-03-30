import { describe, expect, it, vi } from 'vitest';

import { CompositeActiveTenantSource } from './CompositeActiveTenantSource';

describe('CompositeActiveTenantSource', () => {
  it('returns first non-null result', async () => {
    const first = {
      getActiveTenantId: vi.fn().mockResolvedValue('from-first'),
    };
    const second = {
      getActiveTenantId: vi.fn().mockResolvedValue('from-second'),
    };

    const source = new CompositeActiveTenantSource([first, second]);
    const result = await source.getActiveTenantId();

    expect(result).toBe('from-first');
    expect(second.getActiveTenantId).not.toHaveBeenCalled();
  });

  it('falls through to second source when first returns null', async () => {
    const first = { getActiveTenantId: vi.fn().mockResolvedValue(null) };
    const second = {
      getActiveTenantId: vi.fn().mockResolvedValue('from-second'),
    };

    const source = new CompositeActiveTenantSource([first, second]);
    const result = await source.getActiveTenantId();

    expect(result).toBe('from-second');
  });

  it('returns null when all sources return null', async () => {
    const first = { getActiveTenantId: vi.fn().mockResolvedValue(null) };
    const second = { getActiveTenantId: vi.fn().mockResolvedValue(null) };

    const source = new CompositeActiveTenantSource([first, second]);
    const result = await source.getActiveTenantId();

    expect(result).toBeNull();
  });

  it('returns null for empty sources list', async () => {
    const source = new CompositeActiveTenantSource([]);
    const result = await source.getActiveTenantId();

    expect(result).toBeNull();
  });
});
