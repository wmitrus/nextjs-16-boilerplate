import { cookies, headers } from 'next/headers';

import type { RequestIdentitySourceData } from '@/core/contracts/identity';
import { env } from '@/core/env';

import type { ProvisioningInput } from '@/modules/provisioning';

async function resolveActiveTenantId(): Promise<string | undefined> {
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

export async function buildProvisioningInput(
  rawIdentity: RequestIdentitySourceData,
): Promise<ProvisioningInput> {
  const activeTenantId = await resolveActiveTenantId();

  return {
    provider: env.AUTH_PROVIDER,
    externalUserId: rawIdentity.userId!,
    email: rawIdentity.email,
    emailVerified: rawIdentity.emailVerified,
    tenantExternalId: rawIdentity.tenantExternalId,
    tenantRole: rawIdentity.tenantRole,
    activeTenantId,
    tenancyMode: env.TENANCY_MODE,
    tenantContextSource: env.TENANT_CONTEXT_SOURCE,
  };
}
