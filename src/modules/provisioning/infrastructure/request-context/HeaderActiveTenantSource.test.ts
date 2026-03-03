import { describe, expect, it } from 'vitest';

import { HeaderActiveTenantSource } from './HeaderActiveTenantSource';

function makeHeaders(entries: Record<string, string>): Headers {
  return {
    get: (name: string) => entries[name] ?? null,
  } as unknown as Headers;
}

describe('HeaderActiveTenantSource', () => {
  it('returns tenant ID from configured header', async () => {
    const source = new HeaderActiveTenantSource(
      () => makeHeaders({ 'x-tenant-id': 'tenant-uuid-123' }),
      'x-tenant-id',
    );

    const result = await source.getActiveTenantId();

    expect(result).toBe('tenant-uuid-123');
  });

  it('returns null when header is absent', async () => {
    const source = new HeaderActiveTenantSource(
      () => makeHeaders({}),
      'x-tenant-id',
    );

    const result = await source.getActiveTenantId();

    expect(result).toBeNull();
  });

  it('uses custom header name', async () => {
    const source = new HeaderActiveTenantSource(
      () => makeHeaders({ 'x-custom-tenant': 'custom-tenant-uuid' }),
      'x-custom-tenant',
    );

    const result = await source.getActiveTenantId();

    expect(result).toBe('custom-tenant-uuid');
  });
});
