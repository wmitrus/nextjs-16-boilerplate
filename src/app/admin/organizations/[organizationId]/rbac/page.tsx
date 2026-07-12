import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';

import { INFRASTRUCTURE } from '@/core/contracts';
import type { DrizzleDb } from '@/core/db/types';
import { getAppContainer } from '@/core/runtime/bootstrap';

import { getServerRequestLogContext } from '@/shared/lib/observability/server-request-log-context';

import { CreatePolicyForm } from './CreatePolicyForm';
import { PoliciesTableClient } from './PoliciesTableClient';

import { DrizzleAdminOrganizationsReadService } from '@/modules/authorization/infrastructure/drizzle/DrizzleAdminOrganizationsReadService';
import { resolveNodeProvisioningAccess } from '@/security/core/node-provisioning-runtime';

export const metadata: Metadata = {
  title: 'Organization RBAC & Policies — Administration',
  description:
    'Review and manage organization-scoped policies with constrained editing in trusted organization scope.',
};

export default async function OrganizationRbacPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  await connection();

  const resolvedParams = await params;
  await getServerRequestLogContext({
    pathname: `/admin/organizations/${resolvedParams.organizationId}/rbac`,
  });

  const data = await loadOrganizationPolicies(resolvedParams.organizationId);

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
            RBAC &amp; Policies
          </span>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
              {data.organization.name} RBAC &amp; Policies
            </h1>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Review current role-to-policy assignments in the trusted
              organization scope and manage constrained role policies without
              free-form conditions.
            </p>
          </div>
          <span className="inline-flex items-center rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
            {data.policies.length} policies
          </span>
        </div>
      </div>

      <CreatePolicyForm
        organizationId={data.organization.id}
        roles={data.roles}
      />

      {data.policies.length === 0 ? (
        <section className="rounded-xl border border-dashed border-zinc-300 bg-white px-6 py-16 text-center dark:border-zinc-700 dark:bg-zinc-900">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            No policies found
          </h2>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            This organization has no policies in the current trusted admin
            scope.
          </p>
        </section>
      ) : (
        <section className="rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
          <PoliciesTableClient
            organizationId={data.organization.id}
            policies={data.policies}
          />
        </section>
      )}
    </div>
  );
}

async function loadOrganizationPolicies(organizationId: string) {
  const container = getAppContainer();
  const access = await resolveNodeProvisioningAccess(container);

  if (access.status !== 'ALLOWED') {
    return null;
  }

  const db = container.resolve<DrizzleDb>(INFRASTRUCTURE.DB);
  const service = new DrizzleAdminOrganizationsReadService(db);

  return await service.getPoliciesInActiveScope({
    activeOrganizationId: access.tenant.organizationId,
    organizationId,
  });
}
