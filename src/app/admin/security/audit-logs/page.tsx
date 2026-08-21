import type { Metadata } from 'next';
import Link from 'next/link';

import { getServerRequestLogContext } from '@/shared/lib/observability/server-request-log-context';

import { AuditLogsClient } from './AuditLogsClient';

export const metadata: Metadata = {
  title: 'Audit Trail — Administration',
  description: 'Browse recorded audit events across the audit log categories.',
};

export default async function AuditLogsAdminPage() {
  await getServerRequestLogContext({ pathname: '/admin/security/audit-logs' });

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8">
        <Link
          href="/admin/security"
          className="text-sm font-medium text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          ← Back to settings
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
          Security — Audit trail
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Browse recorded audit events. Use the settings page to control which
          categories are captured and how long they are retained.
        </p>
      </div>
      <AuditLogsClient />
    </div>
  );
}
