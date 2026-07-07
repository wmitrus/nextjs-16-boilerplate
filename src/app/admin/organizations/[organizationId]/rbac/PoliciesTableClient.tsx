'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { ACTIONS, RESOURCES } from '@/core/contracts/resources-actions';

import type {
  FormErrorsResponse,
  ServerErrorResponse,
} from '@/shared/types/api-response';

type PolicyRow = {
  id: string;
  roleId: string | null;
  roleName: string | null;
  roleIsSystem: boolean;
  effect: 'allow' | 'deny';
  resource: string;
  actions: string[];
  hasConditions: boolean;
  createdAt: string;
};

type RowState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'success'; message: string }
  | { status: 'error'; message: string };

function getErrorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== 'object') {
    return fallback;
  }

  const maybeServerError = payload as Partial<ServerErrorResponse>;
  if (
    maybeServerError.status === 'server_error' &&
    typeof maybeServerError.error === 'string'
  ) {
    return maybeServerError.error;
  }

  const maybeFormErrors = payload as Partial<FormErrorsResponse>;
  if (
    maybeFormErrors.status === 'form_errors' &&
    maybeFormErrors.errors &&
    typeof maybeFormErrors.errors === 'object'
  ) {
    const firstError = Object.values(maybeFormErrors.errors)
      .flat()
      .find((value) => typeof value === 'string');

    if (typeof firstError === 'string') {
      return firstError;
    }
  }

  return fallback;
}

export function PoliciesTableClient({
  organizationId,
  policies,
}: {
  organizationId: string;
  policies: PolicyRow[];
}) {
  const router = useRouter();
  const [rowState, setRowState] = useState<Record<string, RowState>>({});

  async function handleDelete(policyId: string) {
    setRowState((current) => ({
      ...current,
      [policyId]: { status: 'submitting' },
    }));

    try {
      const response = await fetch(
        `/api/admin/organizations/${organizationId}/policies/${policyId}`,
        { method: 'DELETE' },
      );

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setRowState((current) => ({
          ...current,
          [policyId]: {
            status: 'error',
            message: getErrorMessage(
              payload,
              `Error ${response.status.toString()}`,
            ),
          },
        }));
        return;
      }

      setRowState((current) => ({
        ...current,
        [policyId]: { status: 'success', message: 'Policy deleted.' },
      }));
      router.refresh();
    } catch {
      setRowState((current) => ({
        ...current,
        [policyId]: {
          status: 'error',
          message: 'Network error. Please try again.',
        },
      }));
    }
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-700">
        <thead>
          <tr className="bg-zinc-50 dark:bg-zinc-800/50">
            <th className="px-6 py-3 text-left text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
              Role
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
              Effect
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
              Resource
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
              Actions
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
              Conditions
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
              Created
            </th>
            <th className="px-6 py-3 text-right text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {policies.map((policy) => {
            const isProtected =
              policy.roleIsSystem &&
              policy.roleName?.toLowerCase() === 'owner' &&
              policy.resource === RESOURCES.SECURITY &&
              policy.actions.includes(ACTIONS.SECURITY_MANAGE_POLICIES);
            const currentRowState = rowState[policy.id];

            return (
              <tr
                key={policy.id}
                className="transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
              >
                <td className="px-6 py-4 align-top text-sm text-zinc-900 dark:text-zinc-100">
                  <div>
                    <div>{policy.roleName ?? 'Unscoped'}</div>
                    {currentRowState?.status === 'error' ? (
                      <p className="mt-2 text-xs text-red-600 dark:text-red-400">
                        {currentRowState.message}
                      </p>
                    ) : null}
                    {currentRowState?.status === 'success' ? (
                      <p className="mt-2 text-xs text-green-600 dark:text-green-400">
                        {currentRowState.message}
                      </p>
                    ) : null}
                  </div>
                </td>
                <td className="px-6 py-4 align-top">
                  <span
                    className={[
                      'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                      policy.effect === 'allow'
                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                        : 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400',
                    ].join(' ')}
                  >
                    {policy.effect}
                  </span>
                </td>
                <td className="px-6 py-4 align-top text-sm text-zinc-500 dark:text-zinc-400">
                  {policy.resource}
                </td>
                <td className="px-6 py-4 align-top text-sm text-zinc-500 dark:text-zinc-400">
                  <div className="flex flex-wrap gap-1">
                    {policy.actions.map((action) => (
                      <span
                        key={`${policy.id}-${action}`}
                        className="rounded-md bg-zinc-100 px-2 py-1 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                      >
                        {action}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-6 py-4 align-top text-sm text-zinc-500 dark:text-zinc-400">
                  {policy.hasConditions ? 'Conditional' : 'None'}
                </td>
                <td className="px-6 py-4 align-top text-sm text-zinc-500 dark:text-zinc-400">
                  {formatDate(policy.createdAt)}
                </td>
                <td className="px-6 py-4 text-right align-top">
                  <button
                    type="button"
                    onClick={() => handleDelete(policy.id)}
                    disabled={
                      isProtected || currentRowState?.status === 'submitting'
                    }
                    className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-950/30"
                  >
                    {currentRowState?.status === 'submitting'
                      ? 'Deleting…'
                      : isProtected
                        ? 'Protected'
                        : 'Delete'}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}
