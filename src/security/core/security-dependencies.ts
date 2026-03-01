import type { AuthorizationService } from '@/core/contracts/authorization';
import type { IdentityProvider } from '@/core/contracts/identity';
import type { TenantResolver } from '@/core/contracts/tenancy';

export interface SecurityContextDependencies {
  identityProvider: IdentityProvider;
  tenantResolver: TenantResolver;
}

export type EdgeSecurityDependencies = SecurityContextDependencies;

export interface NodeSecurityDependencies extends SecurityContextDependencies {
  authorizationService: AuthorizationService;
}

export type SecurityDependencies =
  | EdgeSecurityDependencies
  | NodeSecurityDependencies;
