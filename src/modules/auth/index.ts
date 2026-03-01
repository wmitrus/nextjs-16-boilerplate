import type { Container, Module } from '@/core/container';
import { AUTH } from '@/core/contracts';
import type { RequestIdentitySource } from '@/core/contracts/identity';

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

function buildIdentitySource(authProvider: string): RequestIdentitySource {
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

export function createAuthModule(config: AuthModuleConfig): Module {
  return {
    register(container: Container) {
      const identitySource = buildIdentitySource(config.authProvider);

      container.register(AUTH.IDENTITY_SOURCE, identitySource);
      container.register(
        AUTH.IDENTITY_PROVIDER,
        new RequestScopedIdentityProvider(identitySource),
      );
      container.register(
        AUTH.TENANT_RESOLVER,
        new RequestScopedTenantResolver(identitySource),
      );
      container.register(AUTH.USER_REPOSITORY, new ClerkUserRepository());
    },
  };
}

export { SystemIdentitySource };
