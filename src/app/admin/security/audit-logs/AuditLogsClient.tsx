'use client';

import * as React from 'react';

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

export function AuditLogsClient() {
  const [state, setState] = React.useState<FetchState>({ status: 'idle' });
  const [offset, setOffset] = React.useState(0);
  const emptyFilters = {
    category: '',
    outcome: '',
    actorUserId: '',
    targetType: '',
    targetId: '',
  };
  // Applied filters (drive the fetch) vs. draft filters (bound to the form
  // inputs). Splitting these is the whole fix: without it, every keystroke
  // changed `filters` directly, which re-created `fetchEvents` and re-fired
  // the effect below on every character typed -- firing the shared
  // per-client API rate limit before a real search ever completed, and
  // reflowing the table into its loading skeleton on every keystroke. The
  // form already has an explicit "Filter" submit button; this makes the
  // fetch actually wait for it.
  const [filters, setFilters] = React.useState(emptyFilters);
  const [draftFilters, setDraftFilters] = React.useState(emptyFilters);
  const [expanded, setExpanded] = React.useState<number | null>(null);

  const fetchEvents = React.useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const params = new URLSearchParams();
      if (filters.category) params.set('category', filters.category);
      if (filters.outcome) params.set('outcome', filters.outcome);
      if (filters.actorUserId) params.set('actorUserId', filters.actorUserId);
      if (filters.targetType) params.set('targetType', filters.targetType);
      if (filters.targetId) params.set('targetId', filters.targetId);
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
    }
  }, [filters, offset]);

  React.useEffect(() => {
    void fetchEvents();
  }, [fetchEvents]);

  function handleFilterSubmit(
    event: React.SyntheticEvent<HTMLFormElement, SubmitEvent>,
  ) {
    event.preventDefault();
    setOffset(0);
    setFilters(draftFilters);
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

      <form
        onSubmit={handleFilterSubmit}
        className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-700"
      >
        <div className="flex flex-col gap-1">
          <label
            htmlFor="al-category"
            className="text-xs font-medium text-zinc-500 dark:text-zinc-400"
          >
            Category
          </label>
          <select
            id="al-category"
            value={draftFilters.category}
            onChange={(e) =>
              setDraftFilters((f) => ({ ...f, category: e.target.value }))
            }
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
            value={draftFilters.outcome}
            onChange={(e) =>
              setDraftFilters((f) => ({ ...f, outcome: e.target.value }))
            }
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
          <input
            id="al-actor"
            type="text"
            value={draftFilters.actorUserId}
            onChange={(e) =>
              setDraftFilters((f) => ({ ...f, actorUserId: e.target.value }))
            }
            className="w-44 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-zinc-800 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label
            htmlFor="al-target-type"
            className="text-xs font-medium text-zinc-500 dark:text-zinc-400"
          >
            Target type
          </label>
          <input
            id="al-target-type"
            type="text"
            value={draftFilters.targetType}
            onChange={(e) =>
              setDraftFilters((f) => ({ ...f, targetType: e.target.value }))
            }
            className="w-32 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-zinc-800 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label
            htmlFor="al-target-id"
            className="text-xs font-medium text-zinc-500 dark:text-zinc-400"
          >
            Target ID
          </label>
          <input
            id="al-target-id"
            type="text"
            value={draftFilters.targetId}
            onChange={(e) =>
              setDraftFilters((f) => ({ ...f, targetId: e.target.value }))
            }
            className="w-44 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-zinc-800 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
        <button
          type="submit"
          className="rounded-lg bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white dark:bg-white dark:text-zinc-900"
        >
          Filter
        </button>
      </form>

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
          <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-700">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 text-left dark:border-zinc-700 dark:bg-zinc-800/50">
                  <th className="px-4 py-3 font-medium text-zinc-600 dark:text-zinc-400">
                    Occurred
                  </th>
                  <th className="px-4 py-3 font-medium text-zinc-600 dark:text-zinc-400">
                    Category
                  </th>
                  <th className="px-4 py-3 font-medium text-zinc-600 dark:text-zinc-400">
                    Action
                  </th>
                  <th className="px-4 py-3 font-medium text-zinc-600 dark:text-zinc-400">
                    Outcome
                  </th>
                  <th className="px-4 py-3 font-medium text-zinc-600 dark:text-zinc-400">
                    Actor
                  </th>
                  <th className="px-4 py-3 font-medium text-zinc-600 dark:text-zinc-400">
                    Target
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {state.events.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-8 text-center text-zinc-400"
                    >
                      No audit events found for this filter.
                    </td>
                  </tr>
                )}
                {state.events.map((ev) => (
                  <React.Fragment key={ev.id}>
                    <tr
                      className="cursor-pointer bg-white hover:bg-zinc-50 dark:bg-zinc-900 dark:hover:bg-zinc-800/50"
                      onClick={() =>
                        setExpanded((prev) => (prev === ev.id ? null : ev.id))
                      }
                    >
                      <td className="px-4 py-3 whitespace-nowrap text-zinc-500 dark:text-zinc-400">
                        {formatDateTime(ev.occurredAt)}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-zinc-800 dark:text-zinc-200">
                        {ev.category}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-zinc-800 dark:text-zinc-200">
                        {ev.action}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={[
                            'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                            OUTCOME_BADGE[ev.outcome] ??
                              'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400',
                          ].join(' ')}
                        >
                          {ev.outcome}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                        {ev.actorUserId ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                        {ev.targetType
                          ? `${ev.targetType}:${ev.targetId ?? '?'}`
                          : '—'}
                      </td>
                    </tr>
                    {expanded === ev.id && (
                      <tr className="bg-zinc-50 dark:bg-zinc-800/30">
                        <td colSpan={6} className="px-4 py-3">
                          <div className="grid grid-cols-2 gap-2 text-xs text-zinc-600 dark:text-zinc-400">
                            <div>
                              <span className="font-medium">Tenant:</span>{' '}
                              {ev.tenantId ?? '—'}
                            </div>
                            <div>
                              <span className="font-medium">IP:</span>{' '}
                              {ev.ip ?? '—'}
                            </div>
                            <div>
                              <span className="font-medium">
                                Correlation ID:
                              </span>{' '}
                              {ev.correlationId ?? '—'}
                            </div>
                            <div className="col-span-2">
                              <span className="font-medium">Metadata:</span>{' '}
                              {ev.metadata ? (
                                <pre className="mt-1 overflow-x-auto rounded bg-zinc-100 p-2 text-xs dark:bg-zinc-900">
                                  {JSON.stringify(ev.metadata, null, 2)}
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

          <div className="mt-4 flex items-center justify-between text-sm text-zinc-500 dark:text-zinc-400">
            <span>
              {state.total === 0
                ? 'No results'
                : `Showing ${state.offset + 1}–${Math.min(
                    state.offset + state.events.length,
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
                disabled={offset + state.events.length >= state.total}
                className="rounded-lg border border-zinc-200 px-3 py-1.5 disabled:opacity-50 dark:border-zinc-700"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
