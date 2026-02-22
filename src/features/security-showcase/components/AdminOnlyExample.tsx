import React from 'react';

import type { SecurityContext } from '@/security/core/security-context';

/**
 * Example of RBAC in RSC.
 */
export function AdminOnlyExample({ context }: { context: SecurityContext }) {
  const isAdmin = context.user?.role === 'admin';

  if (!isAdmin) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <h3 className="text-lg font-semibold text-red-800">Restricted Area</h3>
        <p className="text-sm text-red-700">
          This section is only visible to <strong>admins</strong>. Your current
          role is: <code>{context.user?.role ?? 'guest'}</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-green-200 bg-green-50 p-4">
      <h3 className="text-lg font-semibold text-green-800">
        Admin Dashboard (Protected)
      </h3>
      <p className="text-sm text-green-700">
        Welcome, Admin! You have access to this restricted content because of
        your role.
      </p>
      <div className="mt-4 rounded border border-green-100 bg-white p-3 font-mono text-xs">
        SENSITIVE_ADMIN_ONLY_DATA: [CONFIDENTIAL]
      </div>
    </div>
  );
}
