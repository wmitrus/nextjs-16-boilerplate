import type { Metadata } from 'next';
import Link from 'next/link';

import { getServerRequestLogContext } from '@/shared/lib/observability/server-request-log-context';

import { AuditSettingsClient } from './AuditSettingsClient';

export const metadata: Metadata = {
  title: 'Security — Administration',
  description:
    'Configure which audit log categories are captured and how long they are retained.',
};

export default async function SecurityAdminPage() {
  await getServerRequestLogContext({ pathname: '/admin/security' });

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            Security — Audit log settings
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Switch audit logging on or off per category, and set how long
            captured events are retained. Managing API access policies will land
            here in a later phase.
          </p>
        </div>
        <Link
          href="/admin/security/audit-logs"
          className="shrink-0 rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-600 dark:hover:bg-zinc-800/50"
        >
          View audit trail →
        </Link>
      </div>
      <AuditSettingsClient />
    </div>
  );
}
