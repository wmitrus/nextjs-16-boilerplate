/** @vitest-environment node */
import { auth } from '@clerk/nextjs/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ClerkRequestIdentitySource } from './ClerkRequestIdentitySource';

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
  clerkClient: vi.fn(),
}));

describe('ClerkRequestIdentitySource', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns userId, tenantExternalId, tenantRole, and email from auth()', async () => {
    vi.mocked(auth).mockResolvedValue({
      userId: 'user_123',
      orgId: 'org_456',
      orgRole: 'org:admin',
      sessionClaims: { email: 'test@example.com' },
    } as unknown as Awaited<ReturnType<typeof auth>>);

    const source = new ClerkRequestIdentitySource();
    const data = await source.get();

    expect(data).toEqual({
      userId: 'user_123',
      tenantExternalId: 'org_456',
      tenantRole: 'org:admin',
      email: 'test@example.com',
    });
  });

  it('returns undefined fields when auth returns nulls', async () => {
    vi.mocked(auth).mockResolvedValue({
      userId: null,
      orgId: null,
      orgRole: null,
      sessionClaims: null,
    } as unknown as Awaited<ReturnType<typeof auth>>);

    const source = new ClerkRequestIdentitySource();
    const data = await source.get();

    expect(data.userId).toBeUndefined();
    expect(data.tenantExternalId).toBeUndefined();
    expect(data.tenantRole).toBeUndefined();
    expect(data.email).toBeUndefined();
  });

  it('returns undefined email when sessionClaims has no email', async () => {
    vi.mocked(auth).mockResolvedValue({
      userId: 'user_123',
      orgId: null,
      orgRole: null,
      sessionClaims: { metadata: {} },
    } as unknown as Awaited<ReturnType<typeof auth>>);

    const source = new ClerkRequestIdentitySource();
    const data = await source.get();

    expect(data.userId).toBe('user_123');
    expect(data.email).toBeUndefined();
    expect(data.tenantExternalId).toBeUndefined();
    expect(data.tenantRole).toBeUndefined();
  });

  it('returns undefined tenantRole when user has no org role', async () => {
    vi.mocked(auth).mockResolvedValue({
      userId: 'user_123',
      orgId: 'org_456',
      orgRole: null,
      sessionClaims: {},
    } as unknown as Awaited<ReturnType<typeof auth>>);

    const source = new ClerkRequestIdentitySource();
    const data = await source.get();

    expect(data.tenantExternalId).toBe('org_456');
    expect(data.tenantRole).toBeUndefined();
  });

  it('memoizes auth() result per source instance', async () => {
    vi.mocked(auth).mockResolvedValue({
      userId: 'user_123',
      orgId: 'org_456',
      orgRole: 'org:member',
      sessionClaims: { email: 'test@example.com' },
    } as unknown as Awaited<ReturnType<typeof auth>>);

    const source = new ClerkRequestIdentitySource();

    const first = await source.get();
    const second = await source.get();

    expect(first).toEqual(second);
    expect(auth).toHaveBeenCalledTimes(1);
  });
});
