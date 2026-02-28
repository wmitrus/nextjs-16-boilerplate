/** @vitest-environment node */
import { auth } from '@clerk/nextjs/server';
import { describe, expect, it, vi } from 'vitest';

import { ClerkRequestIdentitySource } from './ClerkRequestIdentitySource';

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
  clerkClient: vi.fn(),
}));

describe('ClerkRequestIdentitySource', () => {
  it('should return userId, orgId, and email from auth()', async () => {
    vi.mocked(auth).mockResolvedValue({
      userId: 'user_123',
      orgId: 'org_456',
      sessionClaims: { email: 'test@example.com' },
    } as unknown as Awaited<ReturnType<typeof auth>>);

    const source = new ClerkRequestIdentitySource();
    const data = await source.get();

    expect(data).toEqual({
      userId: 'user_123',
      orgId: 'org_456',
      email: 'test@example.com',
    });
  });

  it('should return undefined fields when auth returns nulls', async () => {
    vi.mocked(auth).mockResolvedValue({
      userId: null,
      orgId: null,
      sessionClaims: null,
    } as unknown as Awaited<ReturnType<typeof auth>>);

    const source = new ClerkRequestIdentitySource();
    const data = await source.get();

    expect(data.userId).toBeUndefined();
    expect(data.orgId).toBeUndefined();
    expect(data.email).toBeUndefined();
  });

  it('should return undefined email when sessionClaims has no email', async () => {
    vi.mocked(auth).mockResolvedValue({
      userId: 'user_123',
      orgId: null,
      sessionClaims: { metadata: {} },
    } as unknown as Awaited<ReturnType<typeof auth>>);

    const source = new ClerkRequestIdentitySource();
    const data = await source.get();

    expect(data.userId).toBe('user_123');
    expect(data.email).toBeUndefined();
  });
});
