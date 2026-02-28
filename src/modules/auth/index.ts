import type { Container, Module } from '@/core/container';
import { AUTH } from '@/core/contracts';

import { ClerkRequestIdentitySource } from './infrastructure/ClerkRequestIdentitySource';
import { ClerkUserRepository } from './infrastructure/ClerkUserRepository';
import { RequestScopedIdentityProvider } from './infrastructure/RequestScopedIdentityProvider';
import { RequestScopedTenantResolver } from './infrastructure/RequestScopedTenantResolver';

export const authModule: Module = {
  register(container: Container) {
    const identitySource = new ClerkRequestIdentitySource();

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
