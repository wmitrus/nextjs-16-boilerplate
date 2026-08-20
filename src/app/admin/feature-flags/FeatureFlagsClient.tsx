'use client';

import * as React from 'react';

interface AdminFeatureFlag {
  id: string;
  key: string;
  tenantId: string | null;
  enabled: boolean;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

type ActiveProvider = 'static' | 'db' | 'growthbook';

type FetchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | {
      status: 'success';
      flags: AdminFeatureFlag[];
      activeProvider: ActiveProvider;
    }
  | { status: 'error'; message: string };

type RowActionStatus = 'pending' | 'done' | 'error';

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function FeatureFlagsClient() {
  const [state, setState] = React.useState<FetchState>({ status: 'idle' });
  const [toggleState, setToggleState] = React.useState<
    Map<string, RowActionStatus>
  >(new Map());
  const [deleteState, setDeleteState] = React.useState<
    Map<string, RowActionStatus>
  >(new Map());
  const [confirmDelete, setConfirmDelete] = React.useState<
    Map<string, boolean>
  >(new Map());
  const [descEditOpen, setDescEditOpen] = React.useState<Map<string, boolean>>(
    new Map(),
  );
  const [descEditValues, setDescEditValues] = React.useState<
    Map<string, string>
  >(new Map());
  const [descEditState, setDescEditState] = React.useState<
    Map<string, RowActionStatus>
  >(new Map());

  const [createKey, setCreateKey] = React.useState('');
  const [createTenantId, setCreateTenantId] = React.useState('');
  const [createEnabled, setCreateEnabled] = React.useState(false);
  const [createDescription, setCreateDescription] = React.useState('');
  const [createState, setCreateState] = React.useState<
    'idle' | 'pending' | 'error'
  >('idle');
  const [createError, setCreateError] = React.useState<string | null>(null);

  const fetchFlags = React.useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const res = await fetch('/api/admin/feature-flags');
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
        data: { flags: AdminFeatureFlag[]; activeProvider: ActiveProvider };
      };
      setState({
        status: 'success',
        flags: json.data.flags,
        activeProvider: json.data.activeProvider,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Network error';
      setState({ status: 'error', message: msg });
    }
  }, []);

  React.useEffect(() => {
    void fetchFlags();
  }, [fetchFlags]);

  const mutationsAllowed =
    state.status === 'success' && state.activeProvider === 'db';

  async function handleCreate(
    event: React.SyntheticEvent<HTMLFormElement, SubmitEvent>,
  ) {
    event.preventDefault();
    if (!mutationsAllowed) return;
    setCreateState('pending');
    setCreateError(null);
    try {
      const res = await fetch('/api/admin/feature-flags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: createKey.trim(),
          tenantId: createTenantId.trim() || null,
          enabled: createEnabled,
          description: createDescription.trim() || null,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setCreateState('error');
        setCreateError(body.error ?? `HTTP ${res.status}`);
        return;
      }
      setCreateState('idle');
      setCreateKey('');
      setCreateTenantId('');
      setCreateEnabled(false);
      setCreateDescription('');
      void fetchFlags();
    } catch (err) {
      setCreateState('error');
      setCreateError(err instanceof Error ? err.message : 'Network error');
    }
  }

  async function handleToggle(flag: AdminFeatureFlag) {
    if (!mutationsAllowed) return;
    setToggleState((prev) => new Map(prev).set(flag.id, 'pending'));
    try {
      const res = await fetch(`/api/admin/feature-flags/${flag.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !flag.enabled }),
      });
      if (!res.ok) {
        setToggleState((prev) => new Map(prev).set(flag.id, 'error'));
        return;
      }
      setToggleState((prev) => new Map(prev).set(flag.id, 'done'));
      void fetchFlags();
    } catch {
      setToggleState((prev) => new Map(prev).set(flag.id, 'error'));
    }
  }

  async function handleSaveDescription(flagId: string) {
    if (!mutationsAllowed) return;
    const description = descEditValues.get(flagId) ?? '';
    setDescEditState((prev) => new Map(prev).set(flagId, 'pending'));
    try {
      const res = await fetch(`/api/admin/feature-flags/${flagId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: description.trim() || null }),
      });
      if (!res.ok) {
        setDescEditState((prev) => new Map(prev).set(flagId, 'error'));
        return;
      }
      setDescEditState((prev) => new Map(prev).set(flagId, 'done'));
      setDescEditOpen((prev) => new Map(prev).set(flagId, false));
      void fetchFlags();
    } catch {
      setDescEditState((prev) => new Map(prev).set(flagId, 'error'));
    }
  }

  async function handleDelete(flagId: string) {
    if (!mutationsAllowed) return;
    setDeleteState((prev) => new Map(prev).set(flagId, 'pending'));
    try {
      const res = await fetch(`/api/admin/feature-flags/${flagId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        setDeleteState((prev) => new Map(prev).set(flagId, 'error'));
        return;
      }
      setDeleteState((prev) => new Map(prev).set(flagId, 'done'));
      setConfirmDelete((prev) => new Map(prev).set(flagId, false));
      void fetchFlags();
    } catch {
      setDeleteState((prev) => new Map(prev).set(flagId, 'error'));
    }
  }

  return (
    <div>
      {state.status === 'success' && (
        <div
          className={[
            'mb-4 rounded-lg border px-4 py-3 text-sm',
            state.activeProvider === 'db'
              ? 'border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-400'
              : 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300',
          ].join(' ')}
        >
          Active provider: <strong>{state.activeProvider}</strong>
          {state.activeProvider !== 'db' && (
            <>
              {' '}
              — this admin panel only affects the <code>
                feature_flags
              </code>{' '}
              table. Runtime flag evaluation is currently reading from the{' '}
              <strong>{state.activeProvider}</strong> provider instead, so
              changes made here have <strong>no effect</strong> until{' '}
              <code>FEATURE_FLAG_PROVIDER=db</code>. Create/edit/delete are
              disabled below.
            </>
          )}
        </div>
      )}

      <form
        onSubmit={(event) => void handleCreate(event)}
        className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-700"
      >
        <div className="flex flex-col gap-1">
          <label
            htmlFor="ff-key"
            className="text-xs font-medium text-zinc-500 dark:text-zinc-400"
          >
            Key
          </label>
          <input
            id="ff-key"
            type="text"
            required
            value={createKey}
            onChange={(e) => setCreateKey(e.target.value)}
            disabled={!mutationsAllowed}
            className="w-40 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-zinc-800 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label
            htmlFor="ff-tenant"
            className="text-xs font-medium text-zinc-500 dark:text-zinc-400"
          >
            Tenant ID (empty = global)
          </label>
          <input
            id="ff-tenant"
            type="text"
            value={createTenantId}
            onChange={(e) => setCreateTenantId(e.target.value)}
            disabled={!mutationsAllowed}
            className="w-40 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-zinc-800 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label
            htmlFor="ff-description"
            className="text-xs font-medium text-zinc-500 dark:text-zinc-400"
          >
            Description
          </label>
          <input
            id="ff-description"
            type="text"
            value={createDescription}
            onChange={(e) => setCreateDescription(e.target.value)}
            disabled={!mutationsAllowed}
            className="w-56 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-zinc-800 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
        <label className="flex items-center gap-2 pb-1.5 text-sm text-zinc-600 dark:text-zinc-400">
          <input
            type="checkbox"
            checked={createEnabled}
            onChange={(e) => setCreateEnabled(e.target.checked)}
            disabled={!mutationsAllowed}
          />
          Enabled
        </label>
        <button
          type="submit"
          disabled={!mutationsAllowed || createState === 'pending'}
          className="rounded-lg bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-zinc-900"
        >
          {createState === 'pending' ? 'Creating…' : 'Create flag'}
        </button>
        {createError && (
          <span className="text-xs text-red-600 dark:text-red-400">
            {createError}
          </span>
        )}
      </form>

      {state.status === 'loading' && (
        <div className="space-y-3">
          {[...Array<undefined>(4)].map((_, i) => (
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
        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-700">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 text-left dark:border-zinc-700 dark:bg-zinc-800/50">
                <th className="px-4 py-3 font-medium text-zinc-600 dark:text-zinc-400">
                  Key
                </th>
                <th className="px-4 py-3 font-medium text-zinc-600 dark:text-zinc-400">
                  Scope
                </th>
                <th className="px-4 py-3 font-medium text-zinc-600 dark:text-zinc-400">
                  Enabled
                </th>
                <th className="px-4 py-3 font-medium text-zinc-600 dark:text-zinc-400">
                  Description
                </th>
                <th className="px-4 py-3 font-medium text-zinc-600 dark:text-zinc-400">
                  Updated
                </th>
                <th className="px-4 py-3 font-medium text-zinc-600 dark:text-zinc-400">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {state.flags.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-zinc-400"
                  >
                    No feature flags found.
                  </td>
                </tr>
              )}
              {state.flags.map((flag) => (
                <tr
                  key={flag.id}
                  className="bg-white hover:bg-zinc-50 dark:bg-zinc-900 dark:hover:bg-zinc-800/50"
                >
                  <td className="px-4 py-3 font-mono text-xs text-zinc-800 dark:text-zinc-200">
                    {flag.key}
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                    {flag.tenantId ?? (
                      <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                        Global
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => void handleToggle(flag)}
                      disabled={
                        !mutationsAllowed ||
                        toggleState.get(flag.id) === 'pending'
                      }
                      className={[
                        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium disabled:opacity-50',
                        toggleState.get(flag.id) === 'error'
                          ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                          : flag.enabled
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                            : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400',
                      ].join(' ')}
                    >
                      {toggleState.get(flag.id) === 'pending'
                        ? 'Saving…'
                        : toggleState.get(flag.id) === 'error'
                          ? 'Failed — retry'
                          : flag.enabled
                            ? 'On'
                            : 'Off'}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                    {descEditOpen.get(flag.id) ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={
                            descEditValues.get(flag.id) ??
                            flag.description ??
                            ''
                          }
                          onChange={(e) =>
                            setDescEditValues((prev) =>
                              new Map(prev).set(flag.id, e.target.value),
                            )
                          }
                          className="w-40 rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-600 dark:bg-zinc-800"
                          aria-label="Description"
                        />
                        <button
                          type="button"
                          onClick={() => void handleSaveDescription(flag.id)}
                          disabled={descEditState.get(flag.id) === 'pending'}
                          className="text-xs text-blue-600 hover:underline disabled:opacity-50 dark:text-blue-400"
                        >
                          {descEditState.get(flag.id) === 'pending'
                            ? 'Saving…'
                            : 'Save'}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setDescEditOpen((prev) =>
                              new Map(prev).set(flag.id, false),
                            )
                          }
                          className="text-xs text-zinc-400 hover:underline"
                        >
                          Cancel
                        </button>
                        {descEditState.get(flag.id) === 'error' && (
                          <span className="text-xs text-red-600 dark:text-red-400">
                            Save failed — try again
                          </span>
                        )}
                      </div>
                    ) : (
                      <span>{flag.description ?? '—'}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-zinc-500 dark:text-zinc-400">
                    {formatDate(flag.updatedAt)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {!descEditOpen.get(flag.id) && (
                        <button
                          type="button"
                          onClick={() => {
                            setDescEditValues((prev) =>
                              new Map(prev).set(
                                flag.id,
                                flag.description ?? '',
                              ),
                            );
                            setDescEditOpen((prev) =>
                              new Map(prev).set(flag.id, true),
                            );
                          }}
                          disabled={!mutationsAllowed}
                          className="text-xs text-blue-600 hover:underline disabled:opacity-50 dark:text-blue-400"
                        >
                          Edit
                        </button>
                      )}
                      {confirmDelete.get(flag.id) ? (
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-zinc-500 dark:text-zinc-400">
                            Are you sure?
                          </span>
                          <button
                            type="button"
                            onClick={() => void handleDelete(flag.id)}
                            disabled={deleteState.get(flag.id) === 'pending'}
                            className="text-red-600 hover:underline disabled:opacity-50 dark:text-red-400"
                          >
                            {deleteState.get(flag.id) === 'pending'
                              ? 'Deleting…'
                              : deleteState.get(flag.id) === 'error'
                                ? 'Failed — retry'
                                : 'Yes'}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setConfirmDelete((prev) =>
                                new Map(prev).set(flag.id, false),
                              )
                            }
                            disabled={deleteState.get(flag.id) === 'pending'}
                            className="text-zinc-400 hover:underline disabled:opacity-50"
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            setConfirmDelete((prev) =>
                              new Map(prev).set(flag.id, true),
                            )
                          }
                          disabled={!mutationsAllowed}
                          className="text-xs text-red-600 hover:underline disabled:opacity-50 dark:text-red-400"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
