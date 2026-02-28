import type { AuthorizationService } from '@/core/contracts/authorization';
import type { IdentityProvider } from '@/core/contracts/identity';
import type { TenantResolver } from '@/core/contracts/tenancy';

export interface SecurityDependencies {
  identityProvider: IdentityProvider;
  tenantResolver: TenantResolver;
  authorizationService: AuthorizationService;
}

export type SecurityContextDependencies = Omit<
  SecurityDependencies,
  'authorizationService'
>;
