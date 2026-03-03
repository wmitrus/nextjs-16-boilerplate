import { cookies, headers } from 'next/headers';

import type { Container, Module } from '@/core/container';
import { AUTH, INFRASTRUCTURE } from '@/core/contracts';
import type {
  ExternalAuthProvider,
  InternalIdentityLookup,
  RequestIdentitySource,
} from '@/core/contracts/identity';
import type { MembershipRepository } from '@/core/contracts/repositories';
import type { TenantResolver } from '@/core/contracts/tenancy';
import type { UserRepository } from '@/core/contracts/user';
import type { DrizzleDb } from '@/core/db';

import { AuthJsRequestIdentitySource } from './infrastructure/authjs/AuthJsRequestIdentitySource';
import { ClerkRequestIdentitySource } from './infrastructure/clerk/ClerkRequestIdentitySource';
import { ClerkUserRepository } from './infrastructure/ClerkUserRepository';
import { DrizzleInternalIdentityLookup } from './infrastructure/drizzle/DrizzleInternalIdentityLookup';
import { RequestScopedIdentityProvider } from './infrastructure/RequestScopedIdentityProvider';
import { SupabaseRequestIdentitySource } from './infrastructure/supabase/SupabaseRequestIdentitySource';
import { SystemIdentitySource } from './infrastructure/system/SystemIdentitySource';

import type { TenancyMode } from '@/modules/provisioning/domain/tenancy-mode';
import type { TenantContextSource } from '@/modules/provisioning/domain/tenant-context-source';
import { OrgDbTenantResolver } from '@/modules/provisioning/infrastructure/OrgDbTenantResolver';
import { OrgProviderTenantResolver } from '@/modules/provisioning/infrastructure/OrgProviderTenantResolver';
import { PersonalTenantResolver } from '@/modules/provisioning/infrastructure/PersonalTenantResolver';
import { CompositeActiveTenantSource } from '@/modules/provisioning/infrastructure/request-context/CompositeActiveTenantSource';
import { CookieActiveTenantSource } from '@/modules/provisioning/infrastructure/request-context/CookieActiveTenantSource';
import { HeaderActiveTenantSource } from '@/modules/provisioning/infrastructure/request-context/HeaderActiveTenantSource';
import { SingleTenantResolver } from '@/modules/provisioning/infrastructure/SingleTenantResolver';

export interface AuthModuleConfig {
  authProvider: 'clerk' | 'authjs' | 'supabase';
  tenancyMode: TenancyMode;
  defaultTenantId?: string;
  tenantContextSource?: TenantContextSource;
  tenantContextHeader: string;
  tenantContextCookie: string;
  membershipRepository?: MembershipRepository;
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

function buildTenantResolver(
  config: AuthModuleConfig,
  identitySource: RequestIdentitySource,
  lookup: InternalIdentityLookup | undefined,
): TenantResolver {
  switch (config.tenancyMode) {
    case 'single': {
      if (!config.defaultTenantId) {
        throw new Error(
          '[authModule] TENANCY_MODE=single requires DEFAULT_TENANT_ID to be set.',
        );
      }
      return new SingleTenantResolver(config.defaultTenantId);
    }

    case 'personal': {
      if (!lookup) {
        throw new Error(
          '[authModule] TENANCY_MODE=personal requires a database connection (InternalIdentityLookup).',
        );
      }
      return new PersonalTenantResolver(lookup);
    }

    case 'org': {
      if (!config.tenantContextSource) {
        throw new Error(
          '[authModule] TENANCY_MODE=org requires TENANT_CONTEXT_SOURCE to be set (provider|db). ' +
            'Set TENANT_CONTEXT_SOURCE=provider for Clerk Organizations, or TENANT_CONTEXT_SOURCE=db for app-level tenant selection.',
        );
      }

      if (config.tenantContextSource === 'db') {
        if (!config.membershipRepository) {
          throw new Error(
            '[authModule] TENANCY_MODE=org + TENANT_CONTEXT_SOURCE=db requires membershipRepository.',
          );
        }
        const activeTenantSource = new CompositeActiveTenantSource([
          new HeaderActiveTenantSource(headers, config.tenantContextHeader),
          new CookieActiveTenantSource(cookies, config.tenantContextCookie),
        ]);
        return new OrgDbTenantResolver(
          activeTenantSource,
          config.membershipRepository,
        );
      }

      if (config.tenantContextSource === 'provider') {
        if (!lookup) {
          throw new Error(
            '[authModule] TENANCY_MODE=org + TENANT_CONTEXT_SOURCE=provider requires a database connection.',
          );
        }
        return new OrgProviderTenantResolver(
          identitySource,
          lookup,
          config.authProvider as ExternalAuthProvider,
        );
      }

      throw new Error(
        `[authModule] Unknown TENANT_CONTEXT_SOURCE: ${config.tenantContextSource}`,
      );
    }

    default:
      throw new Error(
        `[authModule] Unknown TENANCY_MODE: ${config.tenancyMode}`,
      );
  }
}

export function createAuthModule(config: AuthModuleConfig): Module {
  return {
    register(container: Container) {
      const identitySource = buildIdentitySource(config.authProvider);
      const userRepository = buildUserRepository(config.authProvider);

      const lookup = container.has(INFRASTRUCTURE.DB)
        ? new DrizzleInternalIdentityLookup(
            container.resolve<DrizzleDb>(INFRASTRUCTURE.DB),
          )
        : undefined;

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
      container.register(AUTH.TENANT_RESOLVER, tenantResolver);
      container.register(AUTH.USER_REPOSITORY, userRepository);
    },
  };
}

export { SystemIdentitySource };
