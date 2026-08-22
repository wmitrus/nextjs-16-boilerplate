import type { AuthorizationService } from '@/core/contracts/authorization';
import type {
  IdentityProvider,
  RequestIdentitySource,
} from '@/core/contracts/identity';
import type { TenantResolver } from '@/core/contracts/tenancy';
import type { UserRepository } from '@/core/contracts/user';

export interface BaseSecurityDependencies {
  identityProvider: IdentityProvider;
  tenantResolver: TenantResolver;
}

export interface NodeSecurityContextDependencies extends BaseSecurityDependencies {
  userRepository: UserRepository;
  /**
   * Raw provider claims for this request, supplying the session issue-time
   * (`iat`) that the revocation check compares against
   * `users.sessions_valid_from` (SEC-36).
   *
   * Deliberately REQUIRED. The check fails closed on a missing issue time,
   * so a caller that quietly omitted this would lock every user who has ever
   * reset their password out of Server Actions -- including the one who just
   * reset it. Making it required turns that into a compile error instead of
   * a production incident.
   */
  requestIdentitySource: RequestIdentitySource;
}

export type EdgeSecurityDependencies = BaseSecurityDependencies;

export interface NodeSecurityDependencies extends BaseSecurityDependencies {
  authorizationService: AuthorizationService;
}

export type SecurityDependencies =
  | EdgeSecurityDependencies
  | NodeSecurityDependencies;

export type SecurityContextDependencies = BaseSecurityDependencies;
