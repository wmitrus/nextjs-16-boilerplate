import { describe, expect, it } from 'vitest';

import { createContainer } from '@/core/container';
import { AUTH, INFRASTRUCTURE } from '@/core/contracts';
import type { UserRepository } from '@/core/contracts/user';
import type { DrizzleDb } from '@/core/db';

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
