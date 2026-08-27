import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';

import { INFRASTRUCTURE } from '@/core/contracts';
import type { DrizzleDb } from '@/core/db/types';
import { getAppContainer } from '@/core/runtime/bootstrap';

import { getServerRequestLogContext } from '@/shared/lib/observability/server-request-log-context';

import { OrganizationStatusActions } from './OrganizationStatusActions';

import { createAdminOrganizationsScope } from '@/modules/authorization/domain/AdminOrganizationsScope';
import { DrizzleAdminOrganizationsReadService } from '@/modules/authorization/infrastructure/drizzle/DrizzleAdminOrganizationsReadService';
import { resolveNodeProvisioningAccess } from '@/security/core/node-provisioning-runtime';
import { isEnvBasedPlatformAdmin } from '@/security/core/platform-admin';

export const metadata: Metadata = {
  title: 'Organization Details — Administration',
  description:
    'Review one organization summary before moving into roles and invitations.',
};

export default async function OrganizationDetailPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  await connection();

  const resolvedParams = await params;
  await getServerRequestLogContext({
    pathname: `/admin/organizations/${resolvedParams.organizationId}`,
  });

  const detail = await loadOrganizationDetail(resolvedParams.organizationId);

  if (!detail) {
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
          <span className="font-medium text-zinc-900 dark:text-zinc-100">
            {detail.organization.name}
          </span>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
              {detail.organization.name}
            </h1>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Review organization metadata, current scope counts, and downstream
              management entry points.
            </p>
          </div>
          <span className="inline-flex items-center rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
            {detail.organization.status}
          </span>
        </div>
      </div>

      <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Organization metadata
        </h2>
        {detail.organization.status === 'archived' ? (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
            This organization is archived. It stays visible for review and RBAC
            maintenance, but it should not be used as an active workspace until
            it is restored.
          </div>
        ) : null}
        <dl className="mt-4 grid gap-4 sm:grid-cols-3">
          <Field label="Organization ID" value={detail.organization.id} />
          <Field
            label="Slug"
            value={detail.organization.slug ?? 'No slug assigned'}
          />
          <Field
            label="Created"
            value={formatDate(detail.organization.createdAt)}
          />
        </dl>
        <OrganizationStatusActions
          organizationId={detail.organization.id}
          status={detail.organization.status as 'active' | 'archived'}
        />
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Scope summary
          </h2>
          <Link
            href={`/admin/organizations/${detail.organization.id}/members`}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Open members
          </Link>
        </div>

        <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Members" value={detail.stats.memberCount.toString()} />
          <Metric label="Roles" value={detail.stats.roleCount.toString()} />
          <Metric
            label="Pending invites"
            value={detail.stats.pendingInvitationCount.toString()}
          />
          <Metric
            label="Policies"
            value={detail.stats.policyCount.toString()}
          />
        </dl>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Next actions
        </h2>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href={`/admin/organizations/${detail.organization.id}/members`}
            className="rounded-md bg-black px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100"
          >
            Manage members
          </Link>
          <Link
            href={`/admin/organizations/${detail.organization.id}/roles`}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Manage roles
          </Link>
          <Link
            href={`/admin/organizations/${detail.organization.id}/rbac`}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Review RBAC &amp; policies
          </Link>
          <Link
            href={`/admin/organizations/${detail.organization.id}/invitations`}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Manage invitations
          </Link>
        </div>
      </section>
    </div>
  );
}

async function loadOrganizationDetail(organizationId: string) {
  const container = getAppContainer();
  const access = await resolveNodeProvisioningAccess(container);

  if (access.status !== 'ALLOWED') {
    return null;
  }

  const db = container.resolve<DrizzleDb>(INFRASTRUCTURE.DB);
  const service = new DrizzleAdminOrganizationsReadService(db);

  return await service.getDetailInActiveScope({
    scope: createAdminOrganizationsScope({
      activeOrganizationId: access.tenant.organizationId,
      isPlatformAdmin: isEnvBasedPlatformAdmin(access.identity.email),
    }),
    organizationId,
  });
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-zinc-50 px-3 py-3 dark:bg-zinc-800/60">
      <dt className="text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
        {label}
      </dt>
      <dd className="mt-1 text-sm font-semibold break-all text-zinc-900 dark:text-zinc-100">
        {value}
      </dd>
    </div>
  );
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
