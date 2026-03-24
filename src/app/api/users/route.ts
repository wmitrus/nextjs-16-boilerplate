import { resolveServerLogger } from '@/core/logger/di';

import { createSuccessResponse } from '@/shared/lib/api/response-service';
import { withErrorHandler } from '@/shared/lib/api/with-error-handler';

import { withNodeProvisioning } from '@/security/api/with-node-provisioning';

const logger = resolveServerLogger().child({
  type: 'API',
  category: 'users',
  module: 'users-route',
});

// This route is intentionally a node-gated provisioning/runtime probe backed by
// sample data. It proves the caller is authenticated and internally ready, but
// it is not the application's canonical example of resource-level RBAC/ABAC.
const sampleUsers = [
  { id: '1', name: 'Ada Lovelace', email: 'ada@sample.dev' },
  { id: '2', name: 'Alan Turing', email: 'alan@sample.dev' },
  { id: '3', name: 'Grace Hopper', email: 'grace@sample.dev' },
];

export const GET = withErrorHandler(
  withNodeProvisioning(async (_request, _context, access) => {
    logger.debug(
      {
        count: sampleUsers.length,
        userId: access.identity.id,
        tenantId: access.tenant.tenantId,
      },
      'Serving sample users after provisioning gate',
    );

    return createSuccessResponse(sampleUsers);
  }),
);
