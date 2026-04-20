import { describe, expect, it } from 'vitest';

import { CookieActiveTenantSource } from './CookieActiveTenantSource';

function getEntryValue(
  entries: Record<string, string>,
  targetName: string,
): string | undefined {
  for (const [entryName, entryValue] of Object.entries(entries)) {
    if (entryName === targetName) {
      return entryValue;
    }
  }

  return undefined;
}

function makeCookies(entries: Record<string, string>) {
  return {
    get: (name: string) => {
      const entry = getEntryValue(entries, name);
      return entry ? { value: entry } : undefined;
    },
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
