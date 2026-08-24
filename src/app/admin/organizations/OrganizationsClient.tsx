'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { useStepUpFetch } from '@/shared/components/step-up/StepUpProvider';

export interface OrganizationSummary {
  id: string;
  name: string;
  slug: string | null;
  status: string;
  createdAt: string;
  memberCount: number;
  roleCount: number;
  pendingInvitationCount: number;
  isActive: boolean;
}

interface OrganizationsClientProps {
  organizations: OrganizationSummary[];
  authProvider: 'clerk' | 'authjs' | 'supabase' | 'neon';
}

type OrganizationFilter = 'active' | 'archived' | 'all';

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

export function OrganizationsClient({
  authProvider,
  organizations,
}: OrganizationsClientProps) {
  const stepUpFetch = useStepUpFetch();
  const router = useRouter();
  const canSwitchActiveOrganization = authProvider === 'authjs';
  const [filter, setFilter] = useState<OrganizationFilter>('active');
  const [pendingOrganizationId, setPendingOrganizationId] = useState<
    string | null
  >(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSetActive(organizationId: string) {
    if (!canSwitchActiveOrganization) {
      return;
    }

    setErrorMessage(null);
    setPendingOrganizationId(organizationId);

    try {
      const response = await stepUpFetch('/api/auth/active-org', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(payload?.error ?? 'Failed to switch organization');
      }

      router.refresh();
    } catch (error) {
      const normalizedError =
        error instanceof Error ? error : new Error(String(error));
      setErrorMessage(normalizedError.message);
    } finally {
      setPendingOrganizationId(null);
    }
  }

  if (organizations.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-300 bg-white px-6 py-16 text-center dark:border-zinc-700 dark:bg-zinc-900">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          No organizations available
        </h2>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          No organizations were found in the current trusted admin scope.
        </p>
      </div>
    );
  }

  const activeOrganization = organizations.find(
    (organization) => organization.isActive,
  );
  const activeOrganizations = organizations.filter(
    (organization) => organization.status === 'active',
  );
  const archivedOrganizations = organizations.filter(
    (organization) => organization.status === 'archived',
  );
  const visibleOrganizations =
    filter === 'active'
      ? activeOrganizations
      : filter === 'archived'
        ? archivedOrganizations
        : organizations;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
              Active organization context
            </p>
            <h2 className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              {activeOrganization?.name ?? 'No active organization selected'}
            </h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Role and invitation management will follow this request-scoped
              organization selection.
            </p>
            {activeOrganization?.status === 'archived' ? (
              <p className="mt-2 text-sm text-amber-700 dark:text-amber-400">
                The current active organization is archived. Restore it before
                treating it as a normal workspace target again.
              </p>
            ) : null}
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            {organizations.length} organizations
          </span>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <FilterButton
            active={filter === 'active'}
            count={activeOrganizations.length}
            label="Active"
            onClick={() => setFilter('active')}
          />
          <FilterButton
            active={filter === 'archived'}
            count={archivedOrganizations.length}
            label="Archived"
            onClick={() => setFilter('archived')}
          />
          <FilterButton
            active={filter === 'all'}
            count={organizations.length}
            label="All"
            onClick={() => setFilter('all')}
          />
        </div>

        {errorMessage ? (
          <p className="mt-4 text-sm text-red-600 dark:text-red-400">
            {errorMessage}
          </p>
        ) : null}
      </div>

      {visibleOrganizations.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-white px-6 py-12 dark:border-zinc-700 dark:bg-zinc-900">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            No {filter === 'all' ? '' : `${filter} `}
            organizations in this view
          </h2>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            Switch the filter to review the rest of the trusted organization
            scope.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {visibleOrganizations.map((organization) => {
            const isSubmitting = pendingOrganizationId === organization.id;
            const isArchived = organization.status === 'archived';
            const cardStateLabel = isArchived
              ? 'Archived'
              : organization.isActive
                ? 'Active'
                : 'Available';
            const activationLabel = isArchived
              ? 'Restore before activating'
              : organization.isActive
                ? 'Active organization'
                : isSubmitting
                  ? 'Switching…'
                  : 'Set active';

            return (
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
                          isArchived
                            ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                            : organization.isActive
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                              : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400',
                        ].join(' ')}
                      >
                        {cardStateLabel}
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
                    href={`/admin/organizations/${organization.id}`}
                    className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  >
                    View details
                  </Link>

                  {canSwitchActiveOrganization ? (
                    <button
                      type="button"
                      disabled={
                        organization.isActive || isSubmitting || isArchived
                      }
                      onClick={() => void handleSetActive(organization.id)}
                      className="rounded-md bg-black px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100"
                    >
                      {activationLabel}
                    </button>
                  ) : null}

                  <Link
                    href={`/admin/organizations/${organization.id}/invitations`}
                    className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  >
                    Open invitations
                  </Link>

                  <Link
                    href={`/admin/organizations/${organization.id}/roles`}
                    className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  >
                    Open roles
                  </Link>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FilterButton({
  active,
  count,
  label,
  onClick,
}: {
  active: boolean;
  count: number;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
        active
          ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900'
          : 'border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800',
      ].join(' ')}
    >
      <span>{label}</span>
      <span className="rounded-full bg-black/10 px-2 py-0.5 text-xs dark:bg-white/10">
        {count}
      </span>
    </button>
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
