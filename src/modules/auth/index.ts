import { cookies, headers } from 'next/headers';

import type { Container, Module } from '@/core/container';
import { AUTH, INFRASTRUCTURE } from '@/core/contracts';
import type {
  ExternalAuthProvider,
  InternalIdentityLookup,
  RequestIdentitySource,
} from '@/core/contracts/identity';
import type { MfaService } from '@/core/contracts/mfa';
import type { TenantResolver } from '@/core/contracts/tenancy';
import type { UserRepository } from '@/core/contracts/user';
import type { DrizzleDb } from '@/core/db';

import { AuthJsRequestIdentitySource } from './infrastructure/authjs/AuthJsRequestIdentitySource';
import { ClerkMfaService } from './infrastructure/clerk/ClerkMfaService';
import { ClerkRequestIdentitySource } from './infrastructure/clerk/ClerkRequestIdentitySource';
import { DrizzleInternalIdentityLookup } from './infrastructure/drizzle/DrizzleInternalIdentityLookup';
import { DrizzleAuthJsMfaService } from './infrastructure/mfa/DrizzleAuthJsMfaService';
import { UnsupportedMfaService } from './infrastructure/mfa/UnsupportedMfaService';
import { NeonRequestIdentitySource } from './infrastructure/neon/NeonRequestIdentitySource';
import { RequestScopedIdentityProvider } from './infrastructure/RequestScopedIdentityProvider';
import { SupabaseRequestIdentitySource } from './infrastructure/supabase/SupabaseRequestIdentitySource';
import { SystemIdentitySource } from './infrastructure/system/SystemIdentitySource';

import type { TenantContextSource } from '@/modules/provisioning/domain/tenant-context-source';
import { OrgDbOrganizationResolver } from '@/modules/provisioning/infrastructure/OrgDbOrganizationResolver';
import { ProviderOrganizationResolver } from '@/modules/provisioning/infrastructure/ProviderOrganizationResolver';
import { CompositeActiveTenantSource } from '@/modules/provisioning/infrastructure/request-context/CompositeActiveTenantSource';
import { CookieActiveTenantSource } from '@/modules/provisioning/infrastructure/request-context/CookieActiveTenantSource';
import { HeaderActiveTenantSource } from '@/modules/provisioning/infrastructure/request-context/HeaderActiveTenantSource';
import { DrizzleUserRepository } from '@/modules/user/infrastructure/drizzle/DrizzleUserRepository';

export interface AuthModuleConfig {
  authProvider: 'clerk' | 'authjs' | 'supabase' | 'neon';
  tenantContextSource: TenantContextSource;
  tenantContextHeader: string;
  tenantContextCookie: string;
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
    case 'neon':
      return new NeonRequestIdentitySource();
    default:
      throw new Error(`[authModule] Unknown AUTH_PROVIDER: ${authProvider}`);
  }
}

/**
 * The second-factor adapter for this provider (SEC-48).
 *
 * Every provider gets one, including the placeholders: an unregistered
 * service would turn a policy gap into a container error at the step-up
 * guard, while `UnsupportedMfaService` refuses the challenge with a reason.
 */
function buildMfaService(
  authProvider: AuthProvider,
  db: DrizzleDb,
): MfaService {
  switch (authProvider) {
    case 'clerk':
      return new ClerkMfaService();
    case 'authjs':
      return new DrizzleAuthJsMfaService(db);
    default:
      return new UnsupportedMfaService(authProvider);
  }
}

function buildTenantResolver(
  config: AuthModuleConfig,
  identitySource: RequestIdentitySource,
  lookup: InternalIdentityLookup,
): TenantResolver {
  if (config.tenantContextSource === 'db') {
    const activeTenantSource = new CompositeActiveTenantSource([
      new HeaderActiveTenantSource(headers, config.tenantContextHeader),
      new CookieActiveTenantSource(cookies, config.tenantContextCookie),
    ]);

    return new OrgDbOrganizationResolver(activeTenantSource);
  }

  if (config.tenantContextSource === 'provider') {
    return new ProviderOrganizationResolver(
      identitySource,
      lookup,
      config.authProvider as ExternalAuthProvider,
    );
  }

  throw new Error(
    `[authModule] Unknown TENANT_CONTEXT_SOURCE: ${config.tenantContextSource}`,
  );
}

export function createAuthModule(config: AuthModuleConfig): Module {
  return {
    register(container: Container) {
      const identitySource = buildIdentitySource(config.authProvider);
      if (!container.has(INFRASTRUCTURE.DB)) {
        throw new Error(
          '[authModule] Missing database runtime. Node auth module requires INFRASTRUCTURE.DB.',
        );
      }

      const db = container.resolve<DrizzleDb>(INFRASTRUCTURE.DB);
      const userRepository: UserRepository = new DrizzleUserRepository(db);
      const lookup = new DrizzleInternalIdentityLookup(db);

      const tenantResolver = buildTenantResolver(
        config,
        identitySource,
        lookup,
      );

      container.register(AUTH.IDENTITY_SOURCE, identitySource);
      container.register(
        AUTH.IDENTITY_PROVIDER,
        new RequestScopedIdentityProvider(identitySource, {
          lookup,
          provider: config.authProvider,
        }),
      );
      container.register(AUTH.INTERNAL_IDENTITY_LOOKUP, lookup);
      container.register(AUTH.TENANT_RESOLVER, tenantResolver);
      container.register(AUTH.USER_REPOSITORY, userRepository);
      container.register(
        AUTH.MFA_SERVICE,
        buildMfaService(config.authProvider, db),
      );
    },
  };
}

export { SystemIdentitySource };
