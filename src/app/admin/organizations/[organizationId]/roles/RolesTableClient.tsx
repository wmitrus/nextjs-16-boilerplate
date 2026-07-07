'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import type {
  FormErrorsResponse,
  ServerErrorResponse,
} from '@/shared/types/api-response';

type RoleRow = {
  id: string;
  name: string;
  isSystem: boolean;
  createdAt: string;
  memberCount: number;
  pendingInvitationCount: number;
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

export function RolesTableClient({
  organizationId,
  roles,
}: {
  organizationId: string;
  roles: RoleRow[];
}) {
  const router = useRouter();
  const [draftNames, setDraftNames] = useState<Map<string, string>>(
    () => new Map(roles.map((role) => [role.id, role.name])),
  );
  const [rowState, setRowState] = useState<Record<string, RowState>>({});

  async function handleRename(roleId: string) {
    const nextName = draftNames.get(roleId)?.trim() ?? '';
    if (!nextName) {
      setRowState((current) => ({
        ...current,
        [roleId]: { status: 'error', message: 'Role name is required.' },
      }));
      return;
    }

    setRowState((current) => ({
      ...current,
      [roleId]: { status: 'submitting' },
    }));

    try {
      const response = await fetch(
        `/api/admin/organizations/${organizationId}/roles/${roleId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: nextName }),
        },
      );

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setRowState((current) => ({
          ...current,
          [roleId]: {
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
        [roleId]: { status: 'success', message: 'Role renamed.' },
      }));
      router.refresh();
    } catch {
      setRowState((current) => ({
        ...current,
        [roleId]: {
          status: 'error',
          message: 'Network error. Please try again.',
        },
      }));
    }
  }

  async function handleDelete(roleId: string) {
    setRowState((current) => ({
      ...current,
      [roleId]: { status: 'submitting' },
    }));

    try {
      const response = await fetch(
        `/api/admin/organizations/${organizationId}/roles/${roleId}`,
        {
          method: 'DELETE',
        },
      );

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setRowState((current) => ({
          ...current,
          [roleId]: {
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
        [roleId]: { status: 'success', message: 'Role deleted.' },
      }));
      router.refresh();
    } catch {
      setRowState((current) => ({
        ...current,
        [roleId]: {
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
              Type
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
              Members
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
              Pending invites
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
          {roles.map((role) => {
            const isProtected =
              role.isSystem ||
              role.memberCount > 0 ||
              role.pendingInvitationCount > 0;
            const currentRowState = rowState[role.id];
            const draftName = draftNames.get(role.id) ?? role.name;

            return (
              <tr
                key={role.id}
                className="transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
              >
                <td className="px-6 py-4 align-top">
                  <div>
                    <input
                      type="text"
                      value={draftName}
                      onChange={(event) =>
                        setDraftNames((current) =>
                          new Map(current).set(role.id, event.target.value),
                        )
                      }
                      disabled={
                        role.isSystem ||
                        currentRowState?.status === 'submitting'
                      }
                      maxLength={50}
                      className="block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-black focus:ring-1 focus:ring-black focus:outline-none disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                    />
                    <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                      {role.id}
                    </p>
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
                      role.isSystem
                        ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                        : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300',
                    ].join(' ')}
                  >
                    {role.isSystem ? 'System' : 'Custom'}
                  </span>
                </td>
                <td className="px-6 py-4 align-top text-sm text-zinc-500 dark:text-zinc-400">
                  {role.memberCount}
                </td>
                <td className="px-6 py-4 align-top text-sm text-zinc-500 dark:text-zinc-400">
                  {role.pendingInvitationCount}
                </td>
                <td className="px-6 py-4 align-top text-sm text-zinc-500 dark:text-zinc-400">
                  {formatDate(role.createdAt)}
                </td>
                <td className="px-6 py-4 text-right align-top">
                  <div className="flex flex-col items-end gap-2">
                    <span
                      className={[
                        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                        isProtected
                          ? 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                          : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
                      ].join(' ')}
                    >
                      {isProtected ? 'Protected now' : 'Low-risk role'}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRename(role.id)}
                      disabled={
                        role.isSystem ||
                        currentRowState?.status === 'submitting'
                      }
                      className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
                    >
                      {currentRowState?.status === 'submitting'
                        ? 'Saving…'
                        : 'Rename'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(role.id)}
                      disabled={
                        isProtected || currentRowState?.status === 'submitting'
                      }
                      className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-950/30"
                    >
                      {currentRowState?.status === 'submitting'
                        ? 'Working…'
                        : 'Delete'}
                    </button>
                  </div>
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
