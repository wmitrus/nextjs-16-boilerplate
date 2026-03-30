import type { ProvisioningStatusSnapshot } from '@/core/contracts/provisioning-access';
import { env } from '@/core/env';

import { createSuccessResponse } from '@/shared/lib/api/response-service';
import { withErrorHandler } from '@/shared/lib/api/with-error-handler';

import { withNodeProvisioning } from '@/security/api/with-node-provisioning';

export const GET = withErrorHandler(
  withNodeProvisioning(async (_request, _context, access) => {
    const snapshot: ProvisioningStatusSnapshot = {
      authenticated: true,
      internalUserId: access.identity.id,
      internalTenantId: access.tenant.tenantId,
      onboardingComplete: access.user.onboardingComplete,
      tenancyMode: env.TENANCY_MODE,
      tenantContextSource: env.TENANT_CONTEXT_SOURCE ?? null,
    };

    return createSuccessResponse(snapshot);
  }),
);
