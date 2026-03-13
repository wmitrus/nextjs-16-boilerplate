import { redirect } from 'next/navigation';

import { AUTH, PROVISIONING } from '@/core/contracts';
import type { RequestIdentitySource } from '@/core/contracts/identity';
import type { UserRepository } from '@/core/contracts/user';
import { PGliteWasmAbortError } from '@/core/db/drivers/create-pglite';
import { env } from '@/core/env';
import { resolveServerLogger } from '@/core/logger/di';
import { getAppContainer } from '@/core/runtime/bootstrap';

import { sanitizeRedirectUrl } from '@/shared/lib/routing/safe-redirect';

import { buildProvisioningInput } from '../build-provisioning-input';

import { BootstrapErrorUI } from './bootstrap-error';
import { BootstrapOrgRequired } from './bootstrap-org-required';

import type { ProvisioningService } from '@/modules/provisioning';
import {
  CrossProviderLinkingNotAllowedError,
  TenantContextRequiredError,
  TenantUserLimitReachedError,
} from '@/modules/provisioning';

const logger = resolveServerLogger().child({
  type: 'API',
  category: 'auth',
  module: 'bootstrap',
});

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

  if (
    env.TENANCY_MODE === 'org' &&
    env.TENANT_CONTEXT_SOURCE === 'provider' &&
    !rawIdentity.tenantExternalId
  ) {
    return <BootstrapOrgRequired />;
  }

  const provisioningService = container.resolve<ProvisioningService>(
    PROVISIONING.SERVICE,
  );
  const provisioningInput = await buildProvisioningInput(rawIdentity);

  let internalUserId: string;

  try {
    const result =
      await provisioningService.ensureProvisioned(provisioningInput);

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

    if (
      err instanceof PGliteWasmAbortError ||
      (err instanceof Error &&
        (err.constructor?.name === 'RuntimeError' ||
          /aborted\(\)/i.test(err.message) ||
          (err as NodeJS.ErrnoException).code === 'ENOENT' ||
          (err as NodeJS.ErrnoException).code === 'EPERM' ||
          (err as NodeJS.ErrnoException).code === 'EACCES'))
    ) {
      return <BootstrapErrorUI error="db_error" />;
    }

    throw err;
  }

  const userRepository = container.resolve<UserRepository>(
    AUTH.USER_REPOSITORY,
  );
  const user = await userRepository.findById(internalUserId);

  if (!user) {
    logger.error(
      {
        event: 'provisioning:bootstrap',
        status: 'invariant_violated',
        internalUserId,
      },
      'Bootstrap invariant violated: provisioning succeeded but user record is missing',
    );
    throw new Error(
      'Bootstrap invariant violated: provisioned user not found in database',
    );
  }

  if (!user.onboardingComplete) {
    redirect(`/onboarding?redirect_url=${encodeURIComponent(safeTarget)}`);
  }

  redirect(safeTarget);
}
