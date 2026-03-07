import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';

import type { ProvisioningApiErrorCode } from '@/core/contracts/provisioning-access';
import { resolveServerLogger } from '@/core/logger/di';
import { getAppContainer } from '@/core/runtime/bootstrap';

import { createServerErrorResponse } from '@/shared/lib/api/response-service';

import {
  type NodeProvisioningAccessAllowed,
  type NodeProvisioningAccessOutcome,
} from '@/security/core/node-provisioning-access';
import { resolveNodeProvisioningAccess } from '@/security/core/node-provisioning-runtime';

type RouteHandlerContext = {
  params: Promise<Record<string, string | string[]>>;
};

type GuardedRouteHandler = (
  request: NextRequest,
  context: RouteHandlerContext,
  access: NodeProvisioningAccessAllowed,
) => Promise<NextResponse> | NextResponse;

const logger = resolveServerLogger().child({
  type: 'API',
  category: 'auth',
  module: 'with-node-provisioning',
});

function mapProvisioningDenyToApiResponse(
  outcome: Exclude<
    NodeProvisioningAccessOutcome,
    NodeProvisioningAccessAllowed
  >,
): NextResponse {
  if (outcome.status === 'UNAUTHENTICATED') {
    return createServerErrorResponse('Unauthorized', 401, 'UNAUTHORIZED');
  }

  if (outcome.status === 'BOOTSTRAP_REQUIRED') {
    return createServerErrorResponse(
      'Bootstrap required',
      409,
      'BOOTSTRAP_REQUIRED',
    );
  }

  if (outcome.status === 'ONBOARDING_REQUIRED') {
    return createServerErrorResponse(
      'Onboarding required',
      409,
      'ONBOARDING_REQUIRED',
    );
  }

  if (outcome.status === 'TENANT_CONTEXT_REQUIRED') {
    const code: ProvisioningApiErrorCode =
      outcome.code === 'DEFAULT_TENANT_NOT_FOUND'
        ? 'DEFAULT_TENANT_NOT_FOUND'
        : 'TENANT_CONTEXT_REQUIRED';

    return createServerErrorResponse(outcome.message, 409, code);
  }

  if (outcome.status === 'TENANT_MEMBERSHIP_REQUIRED') {
    return createServerErrorResponse(
      'Tenant membership required',
      403,
      'TENANT_MEMBERSHIP_REQUIRED',
    );
  }

  return createServerErrorResponse('Forbidden', 403, 'FORBIDDEN');
}

export interface WithNodeProvisioningOptions {
  resolveAccess?: () => Promise<NodeProvisioningAccessOutcome>;
}

export function withNodeProvisioning(
  handler: GuardedRouteHandler,
  options: WithNodeProvisioningOptions = {},
) {
  return async (
    request: NextRequest,
    context: RouteHandlerContext,
  ): Promise<NextResponse> => {
    const resolveAccess =
      options.resolveAccess ??
      (async () => resolveNodeProvisioningAccess(getAppContainer()));

    const accessOutcome = await resolveAccess();

    if (accessOutcome.status !== 'ALLOWED') {
      logger.warn(
        {
          status: accessOutcome.status,
          code: accessOutcome.code,
          path: request.nextUrl.pathname,
        },
        'Node provisioning gate denied request',
      );
      return mapProvisioningDenyToApiResponse(accessOutcome);
    }

    return handler(request, context, accessOutcome);
  };
}

export { mapProvisioningDenyToApiResponse };
