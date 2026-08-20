import type { Metadata } from 'next';

import { getServerRequestLogContext } from '@/shared/lib/observability/server-request-log-context';

import { FeatureFlagsClient } from './FeatureFlagsClient';

export const metadata: Metadata = {
  title: 'Feature Flags — Administration',
  description: 'Toggle features per tenant or globally.',
};

export default async function FeatureFlagsAdminPage() {
  await getServerRequestLogContext({ pathname: '/admin/feature-flags' });

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
          Feature Flags
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Toggle features per tenant or globally. Manage feature flag values and
          overrides.
        </p>
      </div>
      <FeatureFlagsClient />
    </div>
  );
}
