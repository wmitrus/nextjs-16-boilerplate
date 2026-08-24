import { describe, expect, it } from 'vitest';

import { createContainer } from '@/core/container';
import { AUTH, INFRASTRUCTURE } from '@/core/contracts';
import type { MfaService } from '@/core/contracts/mfa';
import type { UserRepository } from '@/core/contracts/user';
import type { DrizzleDb } from '@/core/db';

import { ClerkMfaService } from './infrastructure/clerk/ClerkMfaService';
import { DrizzleAuthJsMfaService } from './infrastructure/mfa/DrizzleAuthJsMfaService';
import { UnsupportedMfaService } from './infrastructure/mfa/UnsupportedMfaService';

import { createAuthModule } from './index';

import { DrizzleUserRepository } from '@/modules/user/infrastructure/drizzle/DrizzleUserRepository';

const baseConfig = {
  tenancyMode: 'single' as const,
  defaultTenantId: '00000000-0000-0000-0000-000000000001',
  tenantContextHeader: 'x-tenant-id',
  tenantContextCookie: 'active_tenant_id',
};

describe('createAuthModule', () => {
  function createContainerWithDb() {
    const container = createContainer();
    container.register(INFRASTRUCTURE.DB, {} as DrizzleDb);
    return container;
  }

  it('registers DB-backed user repository for clerk provider', () => {
    const container = createContainerWithDb();
    const authModule = createAuthModule({
      ...baseConfig,
      authProvider: 'clerk',
    });

    authModule.register(container);

    const userRepository = container.resolve<UserRepository>(
      AUTH.USER_REPOSITORY,
    );

    expect(userRepository).toBeInstanceOf(DrizzleUserRepository);
  });

  it('registers DB-backed user repository for authjs provider', () => {
    const container = createContainerWithDb();
    const authModule = createAuthModule({
      ...baseConfig,
      authProvider: 'authjs',
    });

    authModule.register(container);
    const userRepository = container.resolve<UserRepository>(
      AUTH.USER_REPOSITORY,
    );
    expect(userRepository).toBeInstanceOf(DrizzleUserRepository);
  });

  it('registers DB-backed user repository for supabase provider', () => {
    const container = createContainerWithDb();
    const authModule = createAuthModule({
      ...baseConfig,
      authProvider: 'supabase',
    });

    authModule.register(container);
    const userRepository = container.resolve<UserRepository>(
      AUTH.USER_REPOSITORY,
    );
    expect(userRepository).toBeInstanceOf(DrizzleUserRepository);
  });

  it('registers DB-backed user repository for neon provider', () => {
    const container = createContainerWithDb();
    const authModule = createAuthModule({
      ...baseConfig,
      authProvider: 'neon',
    });

    authModule.register(container);
    const userRepository = container.resolve<UserRepository>(
      AUTH.USER_REPOSITORY,
    );
    expect(userRepository).toBeInstanceOf(DrizzleUserRepository);
  });

  it('fails fast when DB runtime is missing', () => {
    const container = createContainer();
    const authModule = createAuthModule({
      ...baseConfig,
      authProvider: 'clerk',
    });

    expect(() => authModule.register(container)).toThrow(
      'Missing database runtime. Node auth module requires INFRASTRUCTURE.DB.',
    );
  });
});

describe('createAuthModule — MFA adapter selection (SEC-48)', () => {
  function registerFor(authProvider: 'clerk' | 'authjs' | 'supabase' | 'neon') {
    const container = createContainer();
    container.register(INFRASTRUCTURE.DB, {} as DrizzleDb);
    createAuthModule({ ...baseConfig, authProvider }).register(container);
    return container.resolve<MfaService>(AUTH.MFA_SERVICE);
  }

  it('gives Clerk sessions the provider-owned adapter', () => {
    expect(registerFor('clerk')).toBeInstanceOf(ClerkMfaService);
  });

  it('gives AuthJS sessions the application-owned adapter', () => {
    expect(registerFor('authjs')).toBeInstanceOf(DrizzleAuthJsMfaService);
  });

  it.each([['supabase'] as const, ['neon'] as const])(
    'registers a fail-closed adapter for the placeholder provider %s',
    (provider) => {
      // Registered, not omitted: a missing binding would make the step-up
      // guard throw a container error instead of refusing the mutation.
      const service = registerFor(provider);
      expect(service).toBeInstanceOf(UnsupportedMfaService);
    },
  );

  it('refuses every challenge under a placeholder provider', async () => {
    const service = registerFor('neon');

    await expect(
      service.getStatus({ userId: 'user-1' }),
    ).resolves.toMatchObject({ enrolled: false });
    await expect(
      service.verifyChallenge({ userId: 'user-1' }, '123456'),
    ).resolves.toEqual({ ok: false, reason: 'unavailable' });
  });
});
