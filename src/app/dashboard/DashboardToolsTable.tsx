'use client';

import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import Link from 'next/link';
import { useState } from 'react';

import type { DashboardToolRow } from './tools-inventory';

function ToolFootprintBadge({
  footprint,
}: {
  footprint: DashboardToolRow['footprint'];
}) {
  return (
    <span className="rounded-lg bg-zinc-100 px-2 py-1 text-[10px] font-semibold tracking-[0.18em] text-zinc-600 uppercase dark:bg-zinc-800 dark:text-zinc-300">
      {footprint}
    </span>
  );
}

function ToolStatusBadge({ tool }: { tool: DashboardToolRow }) {
  const statusClassName =
    tool.statusTone === 'active'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300'
      : tool.statusTone === 'configured'
        ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300'
        : tool.statusTone === 'ci'
          ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300'
          : tool.statusTone === 'local'
            ? 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700 dark:border-fuchsia-500/20 dark:bg-fuchsia-500/10 dark:text-fuchsia-300'
            : 'border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300';

  return (
    <span
      data-testid={`tool-status-${tool.id}`}
      className={`inline-flex rounded-md border px-2.5 py-1 text-xs font-semibold ${statusClassName}`}
    >
      {tool.statusLabel}
    </span>
  );
}

const columns: ColumnDef<DashboardToolRow>[] = [
  {
    accessorKey: 'name',
    header: 'Tool',
    cell: ({ row }) => {
      const tool = row.original;

      return (
        <div className="min-w-[16rem] space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
              {tool.name}
            </span>
            <ToolFootprintBadge footprint={tool.footprint} />
          </div>
          <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">
            {tool.description}
          </p>
        </div>
      );
    },
  },
  {
    accessorKey: 'group',
    header: 'Group',
    cell: ({ getValue }) => (
      <span className="text-sm text-zinc-700 dark:text-zinc-200">
        {String(getValue())}
      </span>
    ),
  },
  {
    accessorKey: 'statusLabel',
    header: 'Status',
    cell: ({ row }) => <ToolStatusBadge tool={row.original} />,
  },
  {
    id: 'links',
    header: 'Links',
    cell: ({ row }) => {
      const tool = row.original;

      return (
        <div className="flex min-w-[13rem] flex-col gap-2 text-sm">
          {tool.dashboardHref ? (
            <Link
              href={tool.dashboardHref}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-emerald-700 hover:text-emerald-600 dark:text-emerald-400 dark:hover:text-emerald-300"
            >
              {tool.dashboardLabel ?? 'Open dashboard'}
            </Link>
          ) : (
            <span className="text-zinc-400 dark:text-zinc-500">
              No shared dashboard
            </span>
          )}
          {tool.internalHref ? (
            <Link
              href={tool.internalHref}
              className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
            >
              {tool.internalLabel ?? 'Open internal route'}
            </Link>
          ) : null}
        </div>
      );
    },
  },
  {
    id: 'signals',
    accessorFn: (row) => row.signals.join(' '),
    header: 'Signals',
    cell: ({ row }) => (
      <div className="flex min-w-[11rem] flex-wrap gap-2">
        {row.original.signals.map((signal) => (
          <span
            key={`${row.original.id}-${signal}`}
            className="rounded-full border border-zinc-200 px-2 py-1 text-[11px] font-medium text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
          >
            {signal}
          </span>
        ))}
      </div>
    ),
  },
];

export function DashboardToolsTable({ tools }: { tools: DashboardToolRow[] }) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'group', desc: false },
  ]);
  const [globalFilter, setGlobalFilter] = useState('');

  // TanStack Table exposes imperative instance helpers. This component keeps the
  // instance local and does not pass it through memoized props or hooks.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: tools,
    columns,
    state: {
      sorting,
      globalFilter,
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-200">
          <span className="mb-2 block">Filter tools, groups, or statuses</span>
          <input
            value={globalFilter}
            onChange={(event) => setGlobalFilter(event.target.value)}
            placeholder="Search integrations"
            className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 ring-0 transition-colors outline-none placeholder:text-zinc-400 focus:border-emerald-500 lg:w-[22rem] dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:placeholder:text-zinc-500 dark:focus:border-emerald-400"
          />
        </label>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {table.getFilteredRowModel().rows.length} visible of {tools.length}{' '}
          tracked tools
        </p>
      </div>

      <div
        data-testid="dashboard-tools-table"
        className="overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800"
      >
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-800">
            <thead className="bg-zinc-50 dark:bg-zinc-950/60">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => {
                    const canSort = header.column.getCanSort();

                    return (
                      <th
                        key={header.id}
                        className="px-4 py-3 text-left text-xs font-semibold tracking-[0.18em] text-zinc-500 uppercase dark:text-zinc-400"
                      >
                        {header.isPlaceholder ? null : canSort ? (
                          <button
                            type="button"
                            onClick={header.column.getToggleSortingHandler()}
                            className="inline-flex items-center gap-2 text-left"
                          >
                            {flexRender(
                              header.column.columnDef.header,
                              header.getContext(),
                            )}
                            <span className="text-[10px] text-zinc-400">
                              {header.column.getIsSorted() === 'asc'
                                ? 'ASC'
                                : header.column.getIsSorted() === 'desc'
                                  ? 'DESC'
                                  : ''}
                            </span>
                          </button>
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
            <tbody className="divide-y divide-zinc-200 bg-white dark:divide-zinc-800 dark:bg-zinc-900">
              {table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="align-top">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-4">
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
