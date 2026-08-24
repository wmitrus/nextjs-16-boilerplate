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
import { Fragment, useState } from 'react';

import {
  ACTIONS,
  RESOURCES,
  type AppAction,
  type Resource,
} from '@/core/contracts/resources-actions';

import { useStepUpFetch } from '@/shared/components/step-up/StepUpProvider';
import { SortableHeaderButton } from '@/shared/components/table/SortableHeaderButton';
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

type EditDraft = {
  effect: 'allow' | 'deny';
  resource: Resource;
  selectedActions: AppAction[];
};

const RESOURCE_OPTIONS = Object.values(RESOURCES) as Resource[];
const ACTION_OPTIONS = Object.values(ACTIONS);
const ACTIONS_BY_RESOURCE = new Map<Resource, AppAction[]>(
  RESOURCE_OPTIONS.map((resource) => [
    resource,
    ACTION_OPTIONS.filter((action) => action.startsWith(`${resource}:`)),
  ]),
);

function getActionsForResource(resource: Resource): AppAction[] {
  return ACTIONS_BY_RESOURCE.get(resource) ?? [];
}

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
  const stepUpFetch = useStepUpFetch();
  const router = useRouter();
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'createdAt', desc: true },
  ]);
  const [rowState, setRowState] = useState<Partial<Record<string, RowState>>>(
    {},
  );
  const [editingPolicyId, setEditingPolicyId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);

  function startEditing(policy: PolicyRow) {
    const resource = policy.resource as Resource;
    setEditingPolicyId(policy.id);
    setEditDraft({
      effect: policy.effect,
      resource,
      selectedActions: policy.actions as AppAction[],
    });
  }

  function stopEditing() {
    setEditingPolicyId(null);
    setEditDraft(null);
  }

  function toggleEditAction(action: AppAction) {
    setEditDraft((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        selectedActions: current.selectedActions.includes(action)
          ? current.selectedActions.filter((value) => value !== action)
          : [...current.selectedActions, action],
      };
    });
  }

  async function handleEditSubmit(policyId: string) {
    if (!editDraft) {
      return;
    }

    setRowState((current) => ({
      ...current,
      [policyId]: { status: 'submitting' },
    }));

    try {
      const response = await stepUpFetch(
        `/api/admin/organizations/${organizationId}/policies/${policyId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            effect: editDraft.effect,
            resource: editDraft.resource,
            actions: editDraft.selectedActions,
          }),
        },
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
        [policyId]: { status: 'success', message: 'Policy updated.' },
      }));
      stopEditing();
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

  async function handleDelete(policyId: string) {
    setRowState((current) => ({
      ...current,
      [policyId]: { status: 'submitting' },
    }));

    try {
      const response = await stepUpFetch(
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

  const columns: ColumnDef<PolicyRow>[] = [
    {
      id: 'roleName',
      accessorFn: (policy) => policy.roleName ?? 'Unscoped',
      header: 'Role',
      cell: ({ row }) => {
        const policy = row.original;
        const currentRowState = rowState[policy.id];

        return (
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
        );
      },
    },
    {
      accessorKey: 'effect',
      header: 'Effect',
      cell: ({ row }) => {
        const policy = row.original;

        return (
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
        );
      },
    },
    {
      accessorKey: 'resource',
      header: 'Resource',
      cell: ({ row }) => row.original.resource,
    },
    {
      id: 'actionsList',
      accessorFn: (policy) => policy.actions.join(' '),
      header: 'Actions',
      cell: ({ row }) => {
        const policy = row.original;

        return (
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
        );
      },
    },
    {
      id: 'conditions',
      accessorFn: (policy) => (policy.hasConditions ? 'Conditional' : 'None'),
      header: 'Conditions',
      cell: ({ row }) => (row.original.hasConditions ? 'Conditional' : 'None'),
    },
    {
      id: 'createdAt',
      accessorFn: (policy) => new Date(policy.createdAt).getTime(),
      header: 'Created',
      cell: ({ row }) => formatDate(row.original.createdAt),
    },
    {
      id: 'rowActions',
      header: 'Actions',
      enableSorting: false,
      cell: ({ row }) => {
        const policy = row.original;
        const currentRowState = rowState[policy.id];
        const isEditing = editingPolicyId === policy.id;
        const isProtected =
          policy.roleIsSystem &&
          policy.roleName?.toLowerCase() === 'owner' &&
          policy.resource === RESOURCES.SECURITY &&
          policy.actions.includes(ACTIONS.SECURITY_MANAGE_POLICIES);
        const canEdit = !isProtected && policy.roleId !== null;

        return (
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => (isEditing ? stopEditing() : startEditing(policy))}
              disabled={!canEdit || currentRowState?.status === 'submitting'}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              {isProtected ? 'Protected' : isEditing ? 'Cancel' : 'Edit'}
            </button>
            <button
              type="button"
              onClick={() => void handleDelete(policy.id)}
              disabled={isProtected || currentRowState?.status === 'submitting'}
              className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-950/30"
            >
              {currentRowState?.status === 'submitting'
                ? 'Saving…'
                : isProtected
                  ? 'Protected'
                  : 'Delete'}
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
    data: policies,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getRowId: (policy) => policy.id,
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
            const policy = row.original;
            const currentRowState = rowState[policy.id];
            const isEditing = editingPolicyId === policy.id;
            const availableEditActions = editDraft
              ? getActionsForResource(editDraft.resource)
              : [];

            return (
              <Fragment key={row.id}>
                <tr className="transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                  {row.getVisibleCells().map((cell) => {
                    const alignClassName =
                      cell.column.id === 'rowActions'
                        ? 'px-6 py-4 text-right align-top'
                        : cell.column.id === 'effect'
                          ? 'px-6 py-4 align-top'
                          : 'px-6 py-4 align-top text-sm text-zinc-500 dark:text-zinc-400';

                    const roleClassName =
                      cell.column.id === 'roleName'
                        ? 'px-6 py-4 align-top text-sm text-zinc-900 dark:text-zinc-100'
                        : alignClassName;

                    return (
                      <td key={cell.id} className={roleClassName}>
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </td>
                    );
                  })}
                </tr>
                {isEditing && editDraft ? (
                  <tr className="bg-zinc-50/80 dark:bg-zinc-800/40">
                    <td colSpan={7} className="px-6 py-4">
                      <form
                        onSubmit={(event) => {
                          event.preventDefault();
                          void handleEditSubmit(policy.id);
                        }}
                        className="space-y-4"
                      >
                        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                          <div>
                            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                              Edit constrained policy
                            </h3>
                            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                              Role context stays fixed in this step. Update the
                              effect, resource, and allowed actions only.
                            </p>
                          </div>
                          <span className="rounded-md border border-dashed border-zinc-300 px-3 py-2 text-sm text-zinc-400 dark:border-zinc-700 dark:text-zinc-500">
                            Conditions editing stays deferred
                          </span>
                        </div>

                        <div className="grid gap-4 md:grid-cols-3">
                          <label className="block text-sm">
                            <span className="mb-1 block font-medium text-zinc-900 dark:text-zinc-100">
                              Role
                            </span>
                            <input
                              value={policy.roleName ?? 'Unscoped'}
                              readOnly
                              className="block w-full rounded-md border border-zinc-300 bg-zinc-100 px-3 py-2 text-sm shadow-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                            />
                          </label>

                          <label className="block text-sm">
                            <span className="mb-1 block font-medium text-zinc-900 dark:text-zinc-100">
                              Effect
                            </span>
                            <select
                              value={editDraft.effect}
                              onChange={(event) =>
                                setEditDraft((current) =>
                                  current
                                    ? {
                                        ...current,
                                        effect: event.target.value as
                                          | 'allow'
                                          | 'deny',
                                      }
                                    : current,
                                )
                              }
                              disabled={
                                currentRowState?.status === 'submitting'
                              }
                              className="block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-black focus:ring-1 focus:ring-black focus:outline-none disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                            >
                              <option value="allow">allow</option>
                              <option value="deny">deny</option>
                            </select>
                          </label>

                          <label className="block text-sm">
                            <span className="mb-1 block font-medium text-zinc-900 dark:text-zinc-100">
                              Resource
                            </span>
                            <select
                              value={editDraft.resource}
                              onChange={(event) => {
                                const nextResource = event.target
                                  .value as Resource;
                                setEditDraft((current) =>
                                  current
                                    ? {
                                        ...current,
                                        resource: nextResource,
                                        selectedActions: getActionsForResource(
                                          nextResource,
                                        ).slice(0, 1),
                                      }
                                    : current,
                                );
                              }}
                              disabled={
                                currentRowState?.status === 'submitting'
                              }
                              className="block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-black focus:ring-1 focus:ring-black focus:outline-none disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                            >
                              {RESOURCE_OPTIONS.map((option) => (
                                <option key={option} value={option}>
                                  {option}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>

                        <fieldset>
                          <legend className="mb-2 text-sm font-medium text-zinc-900 dark:text-zinc-100">
                            Actions
                          </legend>
                          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                            {availableEditActions.map((action) => (
                              <label
                                key={`${policy.id}-edit-${action}`}
                                className="flex items-center gap-2 rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700"
                              >
                                <input
                                  type="checkbox"
                                  checked={editDraft.selectedActions.includes(
                                    action,
                                  )}
                                  onChange={() => toggleEditAction(action)}
                                  disabled={
                                    currentRowState?.status === 'submitting'
                                  }
                                />
                                <span className="text-zinc-700 dark:text-zinc-300">
                                  {action}
                                </span>
                              </label>
                            ))}
                          </div>
                        </fieldset>

                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={stopEditing}
                            className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            disabled={
                              currentRowState?.status === 'submitting' ||
                              editDraft.selectedActions.length === 0
                            }
                            className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100"
                          >
                            {currentRowState?.status === 'submitting'
                              ? 'Saving…'
                              : 'Save changes'}
                          </button>
                        </div>
                      </form>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
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
