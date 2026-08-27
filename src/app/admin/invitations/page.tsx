import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';

import { INFRASTRUCTURE } from '@/core/contracts';
import type { DrizzleDb } from '@/core/db/types';
import { getAppContainer } from '@/core/runtime/bootstrap';

import { getServerRequestLogContext } from '@/shared/lib/observability/server-request-log-context';

import { createAdminOrganizationsScope } from '@/modules/authorization/domain/AdminOrganizationsScope';
import { DrizzleAdminOrganizationsReadService } from '@/modules/authorization/infrastructure/drizzle/DrizzleAdminOrganizationsReadService';
import { resolveNodeProvisioningAccess } from '@/security/core/node-provisioning-runtime';
import { isEnvBasedPlatformAdmin } from '@/security/core/platform-admin';

export const metadata: Metadata = {
  title: 'Invitations — Administration',
  description:
    'Choose an organization before sending invitations or managing pending invitation links.',
};

export default async function InvitationsAdminPage() {
  await connection();
  await getServerRequestLogContext({ pathname: '/admin/invitations' });

  const data = await loadInvitationsHub();

  if (!data) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
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
              Invitations
            </span>
          </div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            Invitations
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Choose an organization before sending direct invitations or managing
            pending invitation links. The organization page remains the
            canonical operational surface.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          {data.organizations.length} organizations
        </span>
      </div>

      <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
        <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
          Active organization context
        </p>
        <h2 className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          {data.activeOrganization?.name ?? 'No active organization selected'}
        </h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Invitation work is organization-scoped. Choose the target organization
          explicitly before opening the canonical invitations workspace.
        </p>
      </section>

      {data.organizations.length === 0 ? (
        <section className="rounded-xl border border-dashed border-zinc-300 bg-white px-6 py-16 text-center dark:border-zinc-700 dark:bg-zinc-900">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            No organizations available
          </h2>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            No organizations were found in the current trusted admin scope.
          </p>
        </section>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {data.organizations.map((organization) => (
            <section
              key={organization.id}
              className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                      {organization.name}
                    </h3>
                    <span
                      className={[
                        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                        organization.isActive
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                          : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400',
                      ].join(' ')}
                    >
                      {organization.isActive ? 'Active' : 'Available'}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                    {organization.slug
                      ? `Slug: ${organization.slug}`
                      : 'No slug assigned'}
                  </p>
                </div>
                <span className="inline-flex items-center rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                  {organization.status}
                </span>
              </div>

              <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Metric
                  label="Members"
                  value={organization.memberCount.toString()}
                />
                <Metric
                  label="Roles"
                  value={organization.roleCount.toString()}
                />
                <Metric
                  label="Pending invites"
                  value={organization.pendingInvitationCount.toString()}
                />
                <Metric
                  label="Created"
                  value={formatDate(organization.createdAt)}
                />
              </dl>

              <div className="mt-5 flex flex-wrap items-center gap-2">
                <Link
                  href={`/admin/organizations/${organization.id}/invitations`}
                  className="rounded-md bg-black px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100"
                >
                  Open invitations
                </Link>
                <Link
                  href={`/admin/organizations/${organization.id}`}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  View organization
                </Link>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

async function loadInvitationsHub() {
  const container = getAppContainer();
  const access = await resolveNodeProvisioningAccess(container);

  if (access.status !== 'ALLOWED') {
    return null;
  }

  const db = container.resolve<DrizzleDb>(INFRASTRUCTURE.DB);
  const service = new DrizzleAdminOrganizationsReadService(db);
  const data = await service.listInActiveScope({
    scope: createAdminOrganizationsScope({
      activeOrganizationId: access.tenant.organizationId,
      isPlatformAdmin: isEnvBasedPlatformAdmin(access.identity.email),
    }),
    limit: 100,
    offset: 0,
  });

  return {
    activeOrganization:
      data.organizations.find((organization) => organization.isActive) ?? null,
    organizations: data.organizations,
  };
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-zinc-50 px-3 py-3 dark:bg-zinc-800/60">
      <dt className="text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
        {label}
      </dt>
      <dd className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
        {value}
      </dd>
    </div>
  );
}
