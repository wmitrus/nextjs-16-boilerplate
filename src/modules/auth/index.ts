import type { Container, Module } from '@/core/container';
import { AUTH } from '@/core/contracts';
import type { RequestIdentitySource } from '@/core/contracts/identity';
import type { UserRepository } from '@/core/contracts/user';

import { AuthJsRequestIdentitySource } from './infrastructure/authjs/AuthJsRequestIdentitySource';
import { ClerkRequestIdentitySource } from './infrastructure/clerk/ClerkRequestIdentitySource';
import { ClerkUserRepository } from './infrastructure/ClerkUserRepository';
import { RequestScopedIdentityProvider } from './infrastructure/RequestScopedIdentityProvider';
import { RequestScopedTenantResolver } from './infrastructure/RequestScopedTenantResolver';
import { SupabaseRequestIdentitySource } from './infrastructure/supabase/SupabaseRequestIdentitySource';
import { SystemIdentitySource } from './infrastructure/system/SystemIdentitySource';

export interface AuthModuleConfig {
  authProvider: 'clerk' | 'authjs' | 'supabase';
}

type AuthProvider = AuthModuleConfig['authProvider'];

function buildIdentitySource(
  authProvider: AuthProvider,
): RequestIdentitySource {
  switch (authProvider) {
    case 'clerk':
      return new ClerkRequestIdentitySource();
    case 'authjs':
      return new AuthJsRequestIdentitySource();
    case 'supabase':
      return new SupabaseRequestIdentitySource();
    default:
      throw new Error(`[authModule] Unknown AUTH_PROVIDER: ${authProvider}`);
  }
}

function buildUserRepository(authProvider: AuthProvider): UserRepository {
  switch (authProvider) {
    case 'clerk':
      return new ClerkUserRepository();
    case 'authjs':
    case 'supabase':
      throw new Error(
        `[authModule] AUTH_PROVIDER=${authProvider} requires a dedicated UserRepository implementation.`,
      );
    default:
      throw new Error(`[authModule] Unknown AUTH_PROVIDER: ${authProvider}`);
  }
}

export function createAuthModule(config: AuthModuleConfig): Module {
  return {
    register(container: Container) {
      const identitySource = buildIdentitySource(config.authProvider);
      const userRepository = buildUserRepository(config.authProvider);

      container.register(AUTH.IDENTITY_SOURCE, identitySource);
      container.register(
        AUTH.IDENTITY_PROVIDER,
        new RequestScopedIdentityProvider(identitySource),
      );
      container.register(
        AUTH.TENANT_RESOLVER,
        new RequestScopedTenantResolver(identitySource),
      );
      container.register(AUTH.USER_REPOSITORY, userRepository);
    },
  };
}

export { SystemIdentitySource };
