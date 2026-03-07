import type { AuthorizationService } from '@/core/contracts/authorization';
import type { IdentityProvider } from '@/core/contracts/identity';
import type { TenantResolver } from '@/core/contracts/tenancy';
import type { UserRepository } from '@/core/contracts/user';

export interface BaseSecurityDependencies {
  identityProvider: IdentityProvider;
  tenantResolver: TenantResolver;
}

export interface NodeSecurityContextDependencies extends BaseSecurityDependencies {
  userRepository: UserRepository;
}

export type EdgeSecurityDependencies = BaseSecurityDependencies;

export interface NodeSecurityDependencies extends BaseSecurityDependencies {
  authorizationService: AuthorizationService;
}

export type SecurityDependencies =
  | EdgeSecurityDependencies
  | NodeSecurityDependencies;

export type SecurityContextDependencies = BaseSecurityDependencies;
