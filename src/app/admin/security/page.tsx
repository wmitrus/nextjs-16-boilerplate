import type { Metadata } from 'next';

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
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
          Security — Audit log settings
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Switch audit logging on or off per category, and set how long captured
          events are retained. Reviewing security events and managing API access
          policies will land here in a later phase.
        </p>
      </div>
      <AuditSettingsClient />
    </div>
  );
}
