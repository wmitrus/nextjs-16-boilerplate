import type { Metadata } from 'next';

import { getServerRequestLogContext } from '@/shared/lib/observability/server-request-log-context';

import { UsersClient } from './UsersClient';

export const metadata: Metadata = {
  title: 'Users — Administration',
  description: 'Browse, search, and manage all registered users.',
};

export default async function UsersAdminPage() {
  await getServerRequestLogContext({ pathname: '/admin/users' });

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
          User Management
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Browse, search, and manage all registered users.
        </p>
      </div>
      <UsersClient />
    </div>
  );
}
