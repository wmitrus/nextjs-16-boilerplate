import React from 'react';

import type { SecurityContext } from '@/security/core/security-context';

/**
 * Example of authorization-aware rendering in RSC.
 * Role checks are delegated to AuthorizationService (ABAC).
 * SecurityContext carries only identity facts (id, tenantId).
 */
export function AdminOnlyExample({ context }: { context: SecurityContext }) {
  const isAuthenticated = Boolean(context.user);

  if (!isAuthenticated) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <h3 className="text-lg font-semibold text-red-800">Restricted Area</h3>
        <p className="text-sm text-red-700">
          This section requires authentication. Authorization is enforced via
          ABAC policies evaluated by <code>AuthorizationService</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-green-200 bg-green-50 p-4">
      <h3 className="text-lg font-semibold text-green-800">
        Authorization via ABAC (Protected)
      </h3>
      <p className="text-sm text-green-700">
        Access control is evaluated by <code>AuthorizationService.can()</code>{' '}
        against ABAC policies — not by reading a role field from
        SecurityContext.
      </p>
      <div className="mt-4 rounded border border-green-100 bg-white p-3 font-mono text-xs">
        userId: {context.user?.id} | tenantId: {context.user?.tenantId}
      </div>
    </div>
  );
}
