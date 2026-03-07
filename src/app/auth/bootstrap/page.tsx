import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { AUTH, PROVISIONING } from '@/core/contracts';
import type { RequestIdentitySource } from '@/core/contracts/identity';
import type { UserRepository } from '@/core/contracts/user';
import { env } from '@/core/env';
import { resolveServerLogger } from '@/core/logger/di';
import { getAppContainer } from '@/core/runtime/bootstrap';

import { sanitizeRedirectUrl } from '@/shared/lib/routing/safe-redirect';

import { BootstrapErrorUI } from './bootstrap-error';

import {
  CrossProviderLinkingNotAllowedError,
  TenantContextRequiredError,
  TenantUserLimitReachedError,
} from '@/modules/provisioning/domain/errors';
import type { ProvisioningService } from '@/modules/provisioning/domain/ProvisioningService';

const logger = resolveServerLogger().child({
  type: 'API',
  category: 'auth',
  module: 'bootstrap',
});

async function resolveActiveTenantIdForProvisioning(): Promise<
  string | undefined
> {
  if (env.TENANCY_MODE === 'single') {
    return env.DEFAULT_TENANT_ID;
  }

  if (env.TENANCY_MODE === 'org' && env.TENANT_CONTEXT_SOURCE === 'db') {
    const headerList = await headers();
    const headerTenantId = headerList.get(env.TENANT_CONTEXT_HEADER);
    if (headerTenantId) return headerTenantId;

    const cookieStore = await cookies();
    return cookieStore.get(env.TENANT_CONTEXT_COOKIE)?.value;
  }

  return undefined;
}

export default async function BootstrapPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect_url?: string }>;
}) {
  const { redirect_url } = await searchParams;
  const safeTarget = sanitizeRedirectUrl(redirect_url ?? '', '/users');

  const container = getAppContainer();

  const identitySource = container.resolve<RequestIdentitySource>(
    AUTH.IDENTITY_SOURCE,
  );
  const rawIdentity = await identitySource.get();

  if (!rawIdentity.userId) {
    logger.warn('Bootstrap reached without authenticated identity');
    redirect('/sign-in');
  }

  const provisioningService = container.resolve<ProvisioningService>(
    PROVISIONING.SERVICE,
  );
  const activeTenantId = await resolveActiveTenantIdForProvisioning();

  let internalUserId: string;

  try {
    const result = await provisioningService.ensureProvisioned({
      provider: env.AUTH_PROVIDER,
      externalUserId: rawIdentity.userId,
      email: rawIdentity.email,
      emailVerified: rawIdentity.emailVerified,
      tenantExternalId: rawIdentity.tenantExternalId,
      tenantRole: rawIdentity.tenantRole,
      activeTenantId,
      tenancyMode: env.TENANCY_MODE,
      tenantContextSource: env.TENANT_CONTEXT_SOURCE,
    });

    logger.info(
      {
        event: 'provisioning:ensure',
        status: 'success',
        provider: env.AUTH_PROVIDER,
        tenancyMode: env.TENANCY_MODE,
        internalUserId: result.internalUserId,
        internalTenantId: result.internalTenantId,
        membershipRole: result.membershipRole,
        userCreatedNow: result.userCreatedNow,
        tenantCreatedNow: result.tenantCreatedNow,
      },
      'provisioning:ensure succeeded',
    );

    internalUserId = result.internalUserId;
  } catch (err) {
    logger.error(
      {
        event: 'provisioning:ensure',
        status: 'failure',
        provider: env.AUTH_PROVIDER,
        tenancyMode: env.TENANCY_MODE,
        err,
      },
      'provisioning:ensure failed during bootstrap',
    );

    if (err instanceof CrossProviderLinkingNotAllowedError) {
      return <BootstrapErrorUI error="cross_provider_linking" />;
    }

    if (err instanceof TenantUserLimitReachedError) {
      return <BootstrapErrorUI error="quota_exceeded" />;
    }

    if (err instanceof TenantContextRequiredError) {
      return <BootstrapErrorUI error="tenant_config" />;
    }

    return <BootstrapErrorUI error="tenant_config" />;
  }

  const userRepository = container.resolve<UserRepository>(
    AUTH.USER_REPOSITORY,
  );
  const user = await userRepository.findById(internalUserId);

  if (!user?.onboardingComplete) {
    redirect(`/onboarding?redirect_url=${encodeURIComponent(safeTarget)}`);
  }

  redirect(safeTarget);
}
