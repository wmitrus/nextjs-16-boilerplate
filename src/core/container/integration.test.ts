import { auth } from '@clerk/nextjs/server';
import { describe, expect, it, vi } from 'vitest';

import { AUTH, AUTHORIZATION } from '@/core/contracts';
import type { AuthorizationService } from '@/core/contracts/authorization';
import type { IdentityProvider } from '@/core/contracts/identity';

import { bootstrap, container } from './index';

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
}));

describe('System Integration (Wiring)', () => {
  it('should bootstrap and resolve all core services', async () => {
    bootstrap();

    const identityProvider = container.resolve<IdentityProvider>(
      AUTH.IDENTITY_PROVIDER,
    );
    const authzService = container.resolve<AuthorizationService>(
      AUTHORIZATION.SERVICE,
    );

    expect(identityProvider).toBeDefined();
    expect(authzService).toBeDefined();

    // Verify a full mock flow
    vi.mocked(auth).mockResolvedValue({
      userId: 'user_admin_123',
      sessionClaims: {
        email: 'admin@test.com',
        metadata: {},
      },
    } as unknown as Awaited<ReturnType<typeof auth>>);

    const identity = await identityProvider.getCurrentIdentity();
    expect(identity?.id).toBe('user_admin_123');

    const canManage = await authzService.can({
      tenant: { tenantId: 't1', userId: 'user_admin_123' },
      subject: { id: 'user_admin_123' },
      resource: { type: 'document' },
      action: 'manage',
    });

    expect(canManage).toBe(true);
  });
});
