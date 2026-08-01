import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';

import { INFRASTRUCTURE } from '@/core/contracts';
import type { DrizzleDb } from '@/core/db/types';
import { env } from '@/core/env';
import { getAppContainer } from '@/core/runtime/bootstrap';

import { getServerRequestLogContext } from '@/shared/lib/observability/server-request-log-context';

import {
  OrganizationsClient,
  type OrganizationSummary,
} from './OrganizationsClient';

import { DrizzleAdminOrganizationsReadService } from '@/modules/authorization/infrastructure/drizzle/DrizzleAdminOrganizationsReadService';
import { resolveNodeProvisioningAccess } from '@/security/core/node-provisioning-runtime';

export const metadata: Metadata = {
  title: 'Organizations — Administration',
  description:
    'Review organization scope, active workspace context, and downstream administration entry points.',
};

export default async function OrganizationsAdminPage() {
  await connection();
  await getServerRequestLogContext({ pathname: '/admin/organizations' });

  const organizations = await loadOrganizationsInTrustedScope();

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
            <Link
              href="/admin"
              className="transition-colors hover:text-zinc-900 dark:hover:text-zinc-100"
            >
              Administration
            </Link>
            <span>/</span>
            <span className="font-medium text-zinc-900 dark:text-zinc-100">
              Organizations
            </span>
          </div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            Organizations
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Review trusted organization scope, switch the active workspace, and
            prepare downstream roles and invitations work.
          </p>
        </div>
      </div>

      <OrganizationsClient
        authProvider={env.AUTH_PROVIDER}
        organizations={organizations}
      />
    </div>
  );
}

async function loadOrganizationsInTrustedScope(): Promise<
  OrganizationSummary[]
> {
  const container = getAppContainer();
  const access = await resolveNodeProvisioningAccess(container);

  if (access.status !== 'ALLOWED') {
    return [];
  }

  const db = container.resolve<DrizzleDb>(INFRASTRUCTURE.DB);
  const service = new DrizzleAdminOrganizationsReadService(db);
  const result = await service.listInActiveScope({
    activeOrganizationId: access.tenant.organizationId,
    limit: 100,
    offset: 0,
  });

  return result.organizations;
}
