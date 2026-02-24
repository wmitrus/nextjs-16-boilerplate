import type { Container, Module } from '@/core/container';
import { AUTH } from '@/core/contracts';

import { ClerkIdentityProvider } from './infrastructure/ClerkIdentityProvider';
import { ClerkTenantResolver } from './infrastructure/ClerkTenantResolver';

export const authModule: Module = {
  register(container: Container) {
    container.register(AUTH.IDENTITY_PROVIDER, new ClerkIdentityProvider());
    container.register(AUTH.TENANT_RESOLVER, new ClerkTenantResolver());
  },
};
