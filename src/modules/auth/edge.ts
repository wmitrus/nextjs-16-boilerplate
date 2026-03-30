import type { Container, Module } from '@/core/container';
import { AUTH } from '@/core/contracts';
import type { RequestIdentitySource } from '@/core/contracts/identity';

import { AuthJsRequestIdentitySource } from './infrastructure/authjs/AuthJsRequestIdentitySource';
import { ClerkRequestIdentitySource } from './infrastructure/clerk/ClerkRequestIdentitySource';
import { RequestScopedIdentityProvider } from './infrastructure/RequestScopedIdentityProvider';
import { RequestScopedTenantResolver } from './infrastructure/RequestScopedTenantResolver';
import { SupabaseRequestIdentitySource } from './infrastructure/supabase/SupabaseRequestIdentitySource';

export interface EdgeAuthModuleConfig {
  authProvider: 'clerk' | 'authjs' | 'supabase';
}

type AuthProvider = EdgeAuthModuleConfig['authProvider'];

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
      throw new Error(
        `[edgeAuthModule] Unknown AUTH_PROVIDER: ${authProvider}`,
      );
  }
}

export function createEdgeAuthModule(config: EdgeAuthModuleConfig): Module {
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
    },
  };
}
