'use client';

import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table';
import * as React from 'react';

import { Dialog } from '@/shared/components/ui/dialog';

interface AdminAuditEvent {
  id: number;
  occurredAt: string;
  category: string;
  action: string;
  outcome: string;
  tenantId: string | null;
  actorUserId: string | null;
  targetType: string | null;
  targetId: string | null;
  ip: string | null;
  correlationId: string | null;
  metadata: Record<string, unknown> | null;
}

type AdminScope = { isPlatformAdmin: boolean; tenantId: string | null };

/**
 * Shape of `AdminUserDto` (`DrizzleAdminUsersService.ts`) as it crosses the
 * wire -- `Date` fields serialize to ISO strings over JSON.
 */
interface AdminUserSummary {
  id: string;
  email: string;
  displayName?: string;
  deactivatedAt?: string;
  createdAt: string;
}

/**
 * Resolves `actorUserId -> {email, displayName}` (OZI-57) via the existing
 * tenant/platform-admin-scoped `GET /api/admin/users/[id]` -- no new backend
 * read path. Keyed by user id and shared across the whole page's lifetime so
 * paging back to an already-seen actor never re-fetches. An `error` entry
 * (404 for a user outside the caller's authorized scope, or 403 when the
 * caller lacks `USER_READ`) is not retried; the cell just falls back to the
 * raw id.
 */
type UserCacheEntry =
  | { status: 'loading' }
  | { status: 'success'; user: AdminUserSummary }
  | { status: 'error' };

/**
 * How a text filter matches its column (OZI-54). Mirrors
 * `TextMatchOperator` in `DrizzleAuditLogReadService.ts` -- kept as a
 * separate literal union here rather than a shared import since this is a
 * client bundle and the server type lives behind the module boundary.
 */
type TextMatchOperator = 'exact' | 'startsWith' | 'contains';

type FetchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | {
      status: 'success';
      events: AdminAuditEvent[];
      total: number;
      limit: number;
      offset: number;
      scope: AdminScope;
    }
  | { status: 'error'; message: string };

const CATEGORY_OPTIONS = [
  'auth',
  'admin_access',
  'organization',
  'membership',
  'rbac_policy',
  'feature_flag',
  'waitlist',
  'billing',
  'security_event',
  'server_action',
];

const TEXT_MATCH_OPERATORS: Array<{ value: TextMatchOperator; label: string }> =
  [
    { value: 'exact', label: 'Exact' },
    { value: 'startsWith', label: 'Starts with' },
    { value: 'contains', label: 'Contains' },
  ];

/** Below this many characters, `startsWith`/`contains` fire nothing --
 * wildcard scans on 1-2 chars are both low-value and (for `contains`, which
 * runs a trigram GIN scan rather than an index-backed prefix lookup) the
 * most expensive case to run on every keystroke. Real values in this table
 * (UUIDs, category-like strings) are never shorter than this anyway, so the
 * gate never gets in the way of a real search. */
const MIN_FILTER_LENGTH = 3;
const FILTER_DEBOUNCE_MS = 500;

const OUTCOME_BADGE: Record<string, string> = {
  success:
    'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  failure: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  denied:
    'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
};

function formatDateTime(d: string): string {
  return new Date(d).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const PAGE_SIZE = 25;

interface TextFilterValue {
  value: string;
  op: TextMatchOperator;
}

const emptyTextFilter: TextFilterValue = { value: '', op: 'exact' };

/**
 * Local-state-then-debounce input, matching TanStack Table's own reference
 * pattern for a filter box (see their `examples/react/filters`): the
 * keystroke updates local state instantly for a responsive field, and only
 * the settled value is pushed up to the caller (and from there, to a
 * fetch) after `debounceMs`. Also gates on `MIN_FILTER_LENGTH` so a 1-2
 * character wildcard search never fires -- see the constant's doc comment.
 */
function DebouncedTextInput({
  id,
  value,
  onChange,
  className,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  const [localValue, setLocalValue] = React.useState(value);

  React.useEffect(() => {
    setLocalValue(value);
  }, [value]);

  React.useEffect(() => {
    const trimmed = localValue.trim();
    if (trimmed.length > 0 && trimmed.length < MIN_FILTER_LENGTH) {
      return;
    }

    const timeout = setTimeout(() => {
      onChange(localValue);
    }, FILTER_DEBOUNCE_MS);

    return () => clearTimeout(timeout);
    // Only the value should re-arm the debounce timer; `onChange` is a
    // fresh closure on every parent render and would otherwise restart it
    // on every keystroke before it ever fires.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localValue]);

  return (
    <input
      id={id}
      type="text"
      value={localValue}
      onChange={(e) => setLocalValue(e.target.value)}
      className={className}
    />
  );
}

function TextMatchOperatorSelect({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: TextMatchOperator;
  onChange: (op: TextMatchOperator) => void;
}) {
  return (
    <select
      id={id}
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value as TextMatchOperator)}
      className="rounded-lg border border-zinc-200 px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-zinc-800 dark:border-zinc-700 dark:bg-zinc-900"
    >
      {TEXT_MATCH_OPERATORS.map((op) => (
        <option key={op.value} value={op.value}>
          {op.label}
        </option>
      ))}
    </select>
  );
}

export function AuditLogsClient() {
  const [state, setState] = React.useState<FetchState>({ status: 'idle' });
  const [isRefetching, setIsRefetching] = React.useState(false);
  const [offset, setOffset] = React.useState(0);
  const [category, setCategory] = React.useState('');
  const [outcome, setOutcome] = React.useState('');
  const [actorUserId, setActorUserId] =
    React.useState<TextFilterValue>(emptyTextFilter);
  const [targetType, setTargetType] =
    React.useState<TextFilterValue>(emptyTextFilter);
  const [targetId, setTargetId] =
    React.useState<TextFilterValue>(emptyTextFilter);
  const [expanded, setExpanded] = React.useState<number | null>(null);
  const [userCache, setUserCache] = React.useState<
    Record<string, UserCacheEntry>
  >({});
  const [actorDialogUser, setActorDialogUser] =
    React.useState<AdminUserSummary | null>(null);

  const fetchEvents = React.useCallback(async () => {
    // Keep already-rendered rows on screen during a refetch -- only the
    // true first load (no `success` state yet) shows the skeleton. Fixes
    // OZI-53: filtering used to tear the table down into a loading skeleton
    // on every request, jumping the whole page.
    setState((prev) =>
      prev.status === 'success' ? prev : { status: 'loading' },
    );
    setIsRefetching(true);
    try {
      const params = new URLSearchParams();
      if (category) params.set('category', category);
      if (outcome) params.set('outcome', outcome);
      if (actorUserId.value) {
        params.set('actorUserId', actorUserId.value);
        params.set('actorUserIdOp', actorUserId.op);
      }
      if (targetType.value) {
        params.set('targetType', targetType.value);
        params.set('targetTypeOp', targetType.op);
      }
      if (targetId.value) {
        params.set('targetId', targetId.value);
        params.set('targetIdOp', targetId.op);
      }
      params.set('limit', String(PAGE_SIZE));
      params.set('offset', String(offset));

      const res = await fetch(`/api/admin/audit-logs?${params.toString()}`);
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setState({
          status: 'error',
          message: body.error ?? `HTTP ${res.status}`,
        });
        return;
      }
      const json = (await res.json()) as {
        data: {
          events: AdminAuditEvent[];
          total: number;
          limit: number;
          offset: number;
          scope: AdminScope;
        };
      };
      setState({ status: 'success', ...json.data });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Network error';
      setState({ status: 'error', message: msg });
    } finally {
      setIsRefetching(false);
    }
  }, [category, outcome, actorUserId, targetType, targetId, offset]);

  React.useEffect(() => {
    void fetchEvents();
  }, [fetchEvents]);

  const events = state.status === 'success' ? state.events : [];

  React.useEffect(() => {
    const idsToFetch = [
      ...new Set(
        events
          .map((event) => event.actorUserId)
          .filter((id): id is string => id !== null),
      ),
    ].filter((id) => !(id in userCache));

    if (idsToFetch.length === 0) return;

    setUserCache((prev) => {
      const next = { ...prev };
      for (const id of idsToFetch) {
        // `id` is a deduped actorUserId already filtered to `string`, not
        // free-form user input reaching a prototype key.
        // eslint-disable-next-line security/detect-object-injection
        next[id] = { status: 'loading' };
      }
      return next;
    });

    for (const id of idsToFetch) {
      void fetch(`/api/admin/users/${id}`)
        .then(async (res) => {
          if (!res.ok) throw new Error('lookup failed');
          const body = (await res.json()) as {
            data?: { user?: AdminUserSummary };
          };
          const user = body.data?.user;
          if (!user) throw new Error('malformed response');
          setUserCache((prev) => ({
            ...prev,
            [id]: { status: 'success', user },
          }));
        })
        .catch(() => {
          setUserCache((prev) => ({ ...prev, [id]: { status: 'error' } }));
        });
    }
    // Only new events should trigger a lookup -- `userCache` is read above to
    // dedupe, but including it here would re-run this effect (and re-check
    // every id) on every cache update it just made.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events]);

  const columns = React.useMemo<ColumnDef<AdminAuditEvent>[]>(
    () => [
      {
        id: 'occurredAt',
        header: 'Occurred',
        cell: ({ row }) => formatDateTime(row.original.occurredAt),
      },
      {
        id: 'category',
        header: 'Category',
        cell: ({ row }) => row.original.category,
      },
      {
        id: 'action',
        header: 'Action',
        cell: ({ row }) => row.original.action,
      },
      {
        id: 'outcome',
        header: 'Outcome',
        cell: ({ row }) => row.original.outcome,
      },
      {
        id: 'actor',
        header: 'Actor',
        cell: ({ row }) => {
          const actorUserId = row.original.actorUserId;
          if (!actorUserId) return '—';

          // eslint-disable-next-line security/detect-object-injection -- actorUserId comes from the fetched audit event, not free-form user input
          const entry = userCache[actorUserId];
          if (entry?.status !== 'success') return actorUserId;

          const user = entry.user;
          return (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setActorDialogUser(user);
              }}
              className="font-medium text-blue-600 hover:underline dark:text-blue-400"
            >
              {user.displayName ?? user.email}
            </button>
          );
        },
      },
      {
        id: 'target',
        header: 'Target',
        cell: ({ row }) =>
          row.original.targetType
            ? `${row.original.targetType}:${row.original.targetId ?? '?'}`
            : '—',
      },
    ],
    [userCache],
  );

  // TanStack Table exposes imperative instance helpers. This component
  // keeps the instance local and does not pass it through memoized props
  // or hooks.

  const table = useReactTable({
    data: events,
    columns,
    manualFiltering: true,
    manualPagination: true,
    getRowId: (event) => String(event.id),
    getCoreRowModel: getCoreRowModel(),
  });

  function resetToFirstPage() {
    setOffset(0);
  }

  return (
    <div>
      {state.status === 'success' && (
        <div className="mb-4 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-400">
          {state.scope.isPlatformAdmin ? (
            <>
              Showing events across <strong>all tenants</strong>.
            </>
          ) : (
            <>
              Showing events for <strong>your tenant</strong> only (
              {state.scope.tenantId}).
            </>
          )}
        </div>
      )}

      <div className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-700">
        <div className="flex flex-col gap-1">
          <label
            htmlFor="al-category"
            className="text-xs font-medium text-zinc-500 dark:text-zinc-400"
          >
            Category
          </label>
          <select
            id="al-category"
            value={category}
            onChange={(e) => {
              resetToFirstPage();
              setCategory(e.target.value);
            }}
            className="w-40 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-zinc-800 dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="">All</option>
            {CATEGORY_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label
            htmlFor="al-outcome"
            className="text-xs font-medium text-zinc-500 dark:text-zinc-400"
          >
            Outcome
          </label>
          <select
            id="al-outcome"
            value={outcome}
            onChange={(e) => {
              resetToFirstPage();
              setOutcome(e.target.value);
            }}
            className="w-32 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-zinc-800 dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="">All</option>
            <option value="success">success</option>
            <option value="failure">failure</option>
            <option value="denied">denied</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label
            htmlFor="al-actor"
            className="text-xs font-medium text-zinc-500 dark:text-zinc-400"
          >
            Actor user ID
          </label>
          <div className="flex gap-1">
            <DebouncedTextInput
              id="al-actor"
              value={actorUserId.value}
              onChange={(value) => {
                resetToFirstPage();
                setActorUserId((f) => ({ ...f, value }));
              }}
              className="w-40 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-zinc-800 dark:border-zinc-700 dark:bg-zinc-900"
            />
            <TextMatchOperatorSelect
              id="al-actor-op"
              label="Actor user ID match"
              value={actorUserId.op}
              onChange={(op) => {
                resetToFirstPage();
                setActorUserId((f) => ({ ...f, op }));
              }}
            />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label
            htmlFor="al-target-type"
            className="text-xs font-medium text-zinc-500 dark:text-zinc-400"
          >
            Target type
          </label>
          <div className="flex gap-1">
            <DebouncedTextInput
              id="al-target-type"
              value={targetType.value}
              onChange={(value) => {
                resetToFirstPage();
                setTargetType((f) => ({ ...f, value }));
              }}
              className="w-28 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-zinc-800 dark:border-zinc-700 dark:bg-zinc-900"
            />
            <TextMatchOperatorSelect
              id="al-target-type-op"
              label="Target type match"
              value={targetType.op}
              onChange={(op) => {
                resetToFirstPage();
                setTargetType((f) => ({ ...f, op }));
              }}
            />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label
            htmlFor="al-target-id"
            className="text-xs font-medium text-zinc-500 dark:text-zinc-400"
          >
            Target ID
          </label>
          <div className="flex gap-1">
            <DebouncedTextInput
              id="al-target-id"
              value={targetId.value}
              onChange={(value) => {
                resetToFirstPage();
                setTargetId((f) => ({ ...f, value }));
              }}
              className="w-40 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-zinc-800 dark:border-zinc-700 dark:bg-zinc-900"
            />
            <TextMatchOperatorSelect
              id="al-target-id-op"
              label="Target ID match"
              value={targetId.op}
              onChange={(op) => {
                resetToFirstPage();
                setTargetId((f) => ({ ...f, op }));
              }}
            />
          </div>
        </div>
      </div>

      {state.status === 'loading' && (
        <div className="space-y-3">
          {[...Array<undefined>(6)].map((_, i) => (
            <div
              key={i}
              className="h-12 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800"
            />
          ))}
        </div>
      )}

      {state.status === 'error' && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
          Error: {state.message}
        </div>
      )}

      {state.status === 'success' && (
        <>
          <div className="relative">
            {isRefetching && (
              <div
                role="status"
                aria-label="Refreshing results"
                className="absolute inset-0 z-10 flex items-start justify-center rounded-xl bg-white/60 pt-6 dark:bg-zinc-950/60"
              >
                <span className="rounded-full bg-zinc-900 px-3 py-1 text-xs font-medium text-white dark:bg-white dark:text-zinc-900">
                  Refreshing…
                </span>
              </div>
            )}
            <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-700">
              <table className="w-full text-sm">
                <thead>
                  {table.getHeaderGroups().map((headerGroup) => (
                    <tr
                      key={headerGroup.id}
                      className="border-b border-zinc-200 bg-zinc-50 text-left dark:border-zinc-700 dark:bg-zinc-800/50"
                    >
                      {headerGroup.headers.map((header) => (
                        <th
                          key={header.id}
                          className="px-4 py-3 font-medium text-zinc-600 dark:text-zinc-400"
                        >
                          {header.isPlaceholder
                            ? null
                            : flexRender(
                                header.column.columnDef.header,
                                header.getContext(),
                              )}
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {events.length === 0 && (
                    <tr>
                      <td
                        colSpan={columns.length}
                        className="px-4 py-8 text-center text-zinc-400"
                      >
                        No audit events found for this filter.
                      </td>
                    </tr>
                  )}
                  {table.getRowModel().rows.map((row) => (
                    <React.Fragment key={row.id}>
                      <tr
                        className="cursor-pointer bg-white hover:bg-zinc-50 dark:bg-zinc-900 dark:hover:bg-zinc-800/50"
                        onClick={() =>
                          setExpanded((prev) =>
                            prev === row.original.id ? null : row.original.id,
                          )
                        }
                      >
                        {row.getVisibleCells().map((cell) => {
                          if (cell.column.id === 'outcome') {
                            return (
                              <td key={cell.id} className="px-4 py-3">
                                <span
                                  className={[
                                    'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                                    OUTCOME_BADGE[row.original.outcome] ??
                                      'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400',
                                  ].join(' ')}
                                >
                                  {row.original.outcome}
                                </span>
                              </td>
                            );
                          }

                          const className =
                            cell.column.id === 'occurredAt'
                              ? 'px-4 py-3 whitespace-nowrap text-zinc-500 dark:text-zinc-400'
                              : cell.column.id === 'category' ||
                                  cell.column.id === 'action'
                                ? 'px-4 py-3 font-mono text-xs text-zinc-800 dark:text-zinc-200'
                                : 'px-4 py-3 text-zinc-600 dark:text-zinc-400';

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
                      {expanded === row.original.id && (
                        <tr className="bg-zinc-50 dark:bg-zinc-800/30">
                          <td colSpan={columns.length} className="px-4 py-3">
                            <div className="grid grid-cols-2 gap-2 text-xs text-zinc-600 dark:text-zinc-400">
                              <div>
                                <span className="font-medium">Tenant:</span>{' '}
                                {row.original.tenantId ?? '—'}
                              </div>
                              <div>
                                <span className="font-medium">IP:</span>{' '}
                                {row.original.ip ?? '—'}
                              </div>
                              <div>
                                <span className="font-medium">
                                  Correlation ID:
                                </span>{' '}
                                {row.original.correlationId ?? '—'}
                              </div>
                              <div className="col-span-2">
                                <span className="font-medium">Metadata:</span>{' '}
                                {row.original.metadata ? (
                                  <pre className="mt-1 overflow-x-auto rounded bg-zinc-100 p-2 text-xs dark:bg-zinc-900">
                                    {JSON.stringify(
                                      row.original.metadata,
                                      null,
                                      2,
                                    )}
                                  </pre>
                                ) : (
                                  'not captured'
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between text-sm text-zinc-500 dark:text-zinc-400">
            <span>
              {state.total === 0
                ? 'No results'
                : `Showing ${state.offset + 1}–${Math.min(
                    state.offset + events.length,
                    state.total,
                  )} of ${state.total}`}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
                disabled={offset === 0}
                className="rounded-lg border border-zinc-200 px-3 py-1.5 disabled:opacity-50 dark:border-zinc-700"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => setOffset((o) => o + PAGE_SIZE)}
                disabled={offset + events.length >= state.total}
                className="rounded-lg border border-zinc-200 px-3 py-1.5 disabled:opacity-50 dark:border-zinc-700"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}

      {actorDialogUser && (
        <Dialog
          title={actorDialogUser.displayName ?? actorDialogUser.email}
          onClose={() => setActorDialogUser(null)}
        >
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Email
              </dt>
              <dd className="text-zinc-800 dark:text-zinc-200">
                {actorDialogUser.email}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                User ID
              </dt>
              <dd className="font-mono text-xs text-zinc-800 dark:text-zinc-200">
                {actorDialogUser.id}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Joined
              </dt>
              <dd className="text-zinc-800 dark:text-zinc-200">
                {formatDateTime(actorDialogUser.createdAt)}
              </dd>
            </div>
            {actorDialogUser.deactivatedAt && (
              <div>
                <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  Deactivated
                </dt>
                <dd className="text-zinc-800 dark:text-zinc-200">
                  {formatDateTime(actorDialogUser.deactivatedAt)}
                </dd>
              </div>
            )}
          </dl>
        </Dialog>
      )}
    </div>
  );
}
