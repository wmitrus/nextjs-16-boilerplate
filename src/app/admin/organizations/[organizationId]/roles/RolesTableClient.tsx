'use client';

import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { useStepUpFetch } from '@/shared/components/step-up/StepUpProvider';
import { SortableHeaderButton } from '@/shared/components/table/SortableHeaderButton';
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
  const stepUpFetch = useStepUpFetch();
  const router = useRouter();
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'createdAt', desc: true },
  ]);
  const [draftNames, setDraftNames] = useState<Map<string, string>>(
    () => new Map(roles.map((role) => [role.id, role.name])),
  );
  const [rowState, setRowState] = useState<Partial<Record<string, RowState>>>(
    {},
  );

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
      const response = await stepUpFetch(
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
      const response = await stepUpFetch(
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

  const columns: ColumnDef<RoleRow>[] = [
    {
      id: 'name',
      accessorKey: 'name',
      header: 'Role',
      cell: ({ row }) => {
        const role = row.original;
        const currentRowState = rowState[role.id];
        const draftName = draftNames.get(role.id) ?? role.name;

        return (
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
                role.isSystem || currentRowState?.status === 'submitting'
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
        );
      },
    },
    {
      id: 'type',
      accessorFn: (role) => (role.isSystem ? 'System' : 'Custom'),
      header: 'Type',
      cell: ({ row }) => {
        const role = row.original;

        return (
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
        );
      },
    },
    {
      accessorKey: 'memberCount',
      header: 'Members',
      cell: ({ row }) => row.original.memberCount,
    },
    {
      accessorKey: 'pendingInvitationCount',
      header: 'Pending invites',
      cell: ({ row }) => row.original.pendingInvitationCount,
    },
    {
      id: 'createdAt',
      accessorFn: (role) => new Date(role.createdAt).getTime(),
      header: 'Created',
      cell: ({ row }) => formatDate(row.original.createdAt),
    },
    {
      id: 'rowActions',
      header: 'Actions',
      enableSorting: false,
      cell: ({ row }) => {
        const role = row.original;
        const currentRowState = rowState[role.id];
        const isProtected =
          role.isSystem ||
          role.memberCount > 0 ||
          role.pendingInvitationCount > 0;

        return (
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
              onClick={() => void handleRename(role.id)}
              disabled={
                role.isSystem || currentRowState?.status === 'submitting'
              }
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              {currentRowState?.status === 'submitting' ? 'Saving…' : 'Rename'}
            </button>
            <button
              type="button"
              onClick={() => void handleDelete(role.id)}
              disabled={isProtected || currentRowState?.status === 'submitting'}
              className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-950/30"
            >
              {currentRowState?.status === 'submitting' ? 'Working…' : 'Delete'}
            </button>
          </div>
        );
      },
    },
  ];

  // TanStack Table exposes imperative instance helpers. This component keeps
  // the instance local and does not pass it through memoized props or hooks.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: roles,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getRowId: (role) => role.id,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-700">
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id} className="bg-zinc-50 dark:bg-zinc-800/50">
              {headerGroup.headers.map((header) => {
                const canSort = header.column.getCanSort();
                const headerClassName =
                  header.column.id === 'rowActions'
                    ? 'px-6 py-3 text-right text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400'
                    : 'px-6 py-3 text-left text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400';

                return (
                  <th key={header.id} className={headerClassName}>
                    {header.isPlaceholder ? null : canSort ? (
                      <SortableHeaderButton
                        onClick={header.column.getToggleSortingHandler()}
                        direction={header.column.getIsSorted()}
                        label={`Sort by ${String(header.column.columnDef.header)}`}
                      >
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                      </SortableHeaderButton>
                    ) : (
                      flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )
                    )}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {table.getRowModel().rows.map((row) => {
            return (
              <tr
                key={row.id}
                className="transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
              >
                {row.getVisibleCells().map((cell) => {
                  const className =
                    cell.column.id === 'rowActions'
                      ? 'px-6 py-4 text-right align-top'
                      : cell.column.id === 'type'
                        ? 'px-6 py-4 align-top'
                        : cell.column.id === 'name'
                          ? 'px-6 py-4 align-top'
                          : 'px-6 py-4 align-top text-sm text-zinc-500 dark:text-zinc-400';

                  return (
                    <td key={cell.id} className={className}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </td>
                  );
                })}
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
