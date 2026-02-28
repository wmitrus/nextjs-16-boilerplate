import React from 'react';

import type { SecurityContext } from '@/security/core/security-context';
import { sanitizeData } from '@/security/rsc/data-sanitizer';

/**
 * Example of RSC Data Sanitization.
 * Demonstrates: how to clean sensitive data before rendering.
 */
export function ProfileExample({ context }: { context: SecurityContext }) {
  // Simulated raw data from a database that might contain sensitive fields
  const rawUserData = {
    id: context.user?.id,
    email: 'user@example.com',
    tenantId: context.user?.tenantId,
    internalApiKey: 'example-internal-key', // This SHOULD NOT be leaked to the client
    passwordHash: '$2b$12$L8...', // This SHOULD NOT be leaked to the client
    lastLogin: new Date().toISOString(),
  };

  // Sanitize the data
  const safeUserData = sanitizeData(rawUserData);

  return (
    <div className="rounded-lg border bg-white p-4 shadow-sm">
      <h3 className="mb-2 text-lg font-semibold">RSC Data Sanitization</h3>
      <p className="mb-4 text-sm text-gray-600">
        Below is data that was sanitized on the server before being passed to
        this component. Fields like <code>internalApiKey</code> and{' '}
        <code>passwordHash</code> were automatically stripped.
      </p>
      <pre className="overflow-auto rounded bg-gray-50 p-3 text-xs">
        {JSON.stringify(safeUserData, null, 2)}
      </pre>
    </div>
  );
}
