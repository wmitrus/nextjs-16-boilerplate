import { describe, expect, it } from 'vitest';

import { CookieActiveTenantSource } from './CookieActiveTenantSource';

function makeCookies(entries: Record<string, string>) {
  return {
    get: (name: string) =>
      entries[name] ? { value: entries[name] } : undefined,
  };
}

describe('CookieActiveTenantSource', () => {
  it('returns tenant ID from configured cookie', async () => {
    const source = new CookieActiveTenantSource(
      () => makeCookies({ active_tenant_id: 'tenant-from-cookie' }),
      'active_tenant_id',
    );

    const result = await source.getActiveTenantId();

    expect(result).toBe('tenant-from-cookie');
  });

  it('returns null when cookie is absent', async () => {
    const source = new CookieActiveTenantSource(
      () => makeCookies({}),
      'active_tenant_id',
    );

    const result = await source.getActiveTenantId();

    expect(result).toBeNull();
  });

  it('uses custom cookie name', async () => {
    const source = new CookieActiveTenantSource(
      () => makeCookies({ my_tenant: 'my-tenant-uuid' }),
      'my_tenant',
    );

    const result = await source.getActiveTenantId();

    expect(result).toBe('my-tenant-uuid');
  });
});
