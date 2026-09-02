import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';

import { INFRASTRUCTURE } from '@/core/contracts';
import type { DrizzleDb } from '@/core/db/types';
import { getAppContainer } from '@/core/runtime/bootstrap';

import { getServerRequestLogContext } from '@/shared/lib/observability/server-request-log-context';

import { CreateRoleForm } from './CreateRoleForm';
import { RolesTableClient } from './RolesTableClient';

import { resolveOrganizationsAdminScope } from '@/app/admin/organizations/organizations-admin-scope';
import { DrizzleAdminOrganizationsReadService } from '@/modules/authorization/infrastructure/drizzle/DrizzleAdminOrganizationsReadService';
import { resolveNodeProvisioningAccess } from '@/security/core/node-provisioning-runtime';

export const metadata: Metadata = {
  title: 'Organization Roles — Administration',
  description:
    'Review organization-scoped roles and current protection signals before role lifecycle changes are introduced.',
};

export default async function OrganizationRolesPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  await connection();

  const resolvedParams = await params;
  await getServerRequestLogContext({
    pathname: `/admin/organizations/${resolvedParams.organizationId}/roles`,
  });

  const data = await loadOrganizationRoles(resolvedParams.organizationId);

  if (!data) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-1 flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
          <Link
            href="/admin"
            className="transition-colors hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            Administration
          </Link>
          <span>/</span>
          <Link
            href="/admin/organizations"
            className="transition-colors hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            Organizations
          </Link>
          <span>/</span>
          <Link
            href={`/admin/organizations/${data.organization.id}`}
            className="transition-colors hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            {data.organization.name}
          </Link>
          <span>/</span>
          <span className="font-medium text-zinc-900 dark:text-zinc-100">
            Roles
          </span>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
              {data.organization.name} roles
            </h1>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Review organization-scoped roles, rename custom roles safely, and
              inspect protection signals before broader lifecycle actions are
              introduced.
            </p>
          </div>
          <span className="inline-flex items-center rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
            {data.roles.length} roles
          </span>
        </div>
      </div>

      <CreateRoleForm organizationId={data.organization.id} />

      {data.roles.length === 0 ? (
        <section className="rounded-xl border border-dashed border-zinc-300 bg-white px-6 py-16 text-center dark:border-zinc-700 dark:bg-zinc-900">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            No roles found
          </h2>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            This organization has no roles in the current trusted admin scope.
          </p>
        </section>
      ) : (
        <section className="rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
          <RolesTableClient
            organizationId={data.organization.id}
            roles={data.roles}
          />
        </section>
      )}
    </div>
  );
}

async function loadOrganizationRoles(organizationId: string) {
  const container = getAppContainer();
  const access = await resolveNodeProvisioningAccess(container);

  if (access.status !== 'ALLOWED') {
    return null;
  }

  const db = container.resolve<DrizzleDb>(INFRASTRUCTURE.DB);
  const scope = await resolveOrganizationsAdminScope(access, db);

  if (!scope) {
    return null;
  }

  const service = new DrizzleAdminOrganizationsReadService(db);

  return await service.getRolesInActiveScope({ scope, organizationId });
}
