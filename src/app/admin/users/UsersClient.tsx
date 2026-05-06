'use client';

import * as React from 'react';

interface AdminUser {
  id: string;
  email?: string;
  displayName?: string;
  onboardingComplete: boolean;
  deactivatedAt?: string | null;
  createdAt?: string | null;
}

type FetchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | {
      status: 'success';
      users: AdminUser[];
      total: number;
      limit: number;
      offset: number;
    }
  | { status: 'error'; message: string };

type ActionState = { [id: string]: 'pending' | 'done' | 'error' };

function formatDate(d: string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

function buildAdminUsersRequestUrl(offset: number, search: string): string {
  const url = new URL('/api/admin/users', window.location.origin);
  url.searchParams.set('limit', '50');
  url.searchParams.set('offset', String(offset));
  if (search) {
    url.searchParams.set('search', search);
  }
  return `${url.pathname}${url.search}`;
}

export function UsersClient() {
  const [state, setState] = React.useState<FetchState>({ status: 'idle' });
  const [search, setSearch] = React.useState('');
  const [page, setPage] = React.useState(0);
  const [editState, setEditState] = React.useState<ActionState>({});
  const [deactivateState, setDeactivateState] = React.useState<ActionState>({});
  const [confirmDeactivate, setConfirmDeactivate] = React.useState<
    Record<string, boolean>
  >({});
  const [editValues, setEditValues] = React.useState<Map<string, string>>(
    new Map(),
  );
  const [editOpen, setEditOpen] = React.useState<{ [id: string]: boolean }>({});

  const limit = 50;
  const debouncedSearch = useDebounce(search, 300);

  const fetchUsers = React.useCallback(async (offset: number, q: string) => {
    setState({ status: 'loading' });
    try {
      const res = await fetch(buildAdminUsersRequestUrl(offset, q));
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setState({
          status: 'error',
          message: body.error ?? `HTTP ${res.status}`,
        });
        return;
      }
      const json = (await res.json()) as {
        data: {
          users: AdminUser[];
          total: number;
          limit: number;
          offset: number;
        };
      };
      setState({
        status: 'success',
        users: json.data.users,
        total: json.data.total,
        limit: json.data.limit,
        offset: json.data.offset,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Network error';
      setState({ status: 'error', message: msg });
    }
  }, []);

  React.useEffect(() => {
    const offset = page * limit;
    void fetchUsers(offset, debouncedSearch);
  }, [fetchUsers, page, debouncedSearch]);

  async function handleDeactivate(userId: string) {
    setDeactivateState((prev) => ({ ...prev, [userId]: 'pending' }));
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'deactivate' }),
      });
      if (!res.ok) {
        setDeactivateState((prev) => ({ ...prev, [userId]: 'error' }));
        return;
      }
      setDeactivateState((prev) => ({ ...prev, [userId]: 'done' }));
      setConfirmDeactivate((prev) => ({ ...prev, [userId]: false }));
      const offset = page * limit;
      void fetchUsers(offset, debouncedSearch);
    } catch {
      setDeactivateState((prev) => ({ ...prev, [userId]: 'error' }));
    }
  }

  async function handleUpdateDisplayName(userId: string) {
    const name = editValues.get(userId)?.trim();
    if (!name) return;
    setEditState((prev) => ({ ...prev, [userId]: 'pending' }));
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: name }),
      });
      if (!res.ok) {
        setEditState((prev) => ({ ...prev, [userId]: 'error' }));
        return;
      }
      setEditState((prev) => ({ ...prev, [userId]: 'done' }));
      setEditOpen((prev) => ({ ...prev, [userId]: false }));
      const offset = page * limit;
      void fetchUsers(offset, debouncedSearch);
    } catch {
      setEditState((prev) => ({ ...prev, [userId]: 'error' }));
    }
  }

  const totalPages =
    state.status === 'success' ? Math.ceil(state.total / limit) : 0;

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <input
          type="search"
          placeholder="Search by email or name…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
          className="w-full max-w-sm rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm shadow-sm outline-none focus:ring-2 focus:ring-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          aria-label="Search users"
        />
        {state.status === 'success' && (
          <span className="text-sm text-zinc-500 dark:text-zinc-400">
            {state.total} user{state.total !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {state.status === 'loading' && (
        <div className="space-y-3">
          {[...Array<undefined>(5)].map((_, i) => (
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
                    Email
                  </th>
                  <th className="px-4 py-3 font-medium text-zinc-600 dark:text-zinc-400">
                    Display Name
                  </th>
                  <th className="px-4 py-3 font-medium text-zinc-600 dark:text-zinc-400">
                    Onboarded
                  </th>
                  <th className="px-4 py-3 font-medium text-zinc-600 dark:text-zinc-400">
                    Created
                  </th>
                  <th className="px-4 py-3 font-medium text-zinc-600 dark:text-zinc-400">
                    Status
                  </th>
                  <th className="px-4 py-3 font-medium text-zinc-600 dark:text-zinc-400">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {state.users.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-8 text-center text-zinc-400"
                    >
                      No users found.
                    </td>
                  </tr>
                )}
                {state.users.map((user) => (
                  <tr
                    key={user.id}
                    className="bg-white hover:bg-zinc-50 dark:bg-zinc-900 dark:hover:bg-zinc-800/50"
                  >
                    <td className="px-4 py-3 text-zinc-800 dark:text-zinc-200">
                      {user.email ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                      {editOpen[user.id] ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={
                              editValues.get(user.id) ?? user.displayName ?? ''
                            }
                            onChange={(e) =>
                              setEditValues((prev) =>
                                new Map(prev).set(user.id, e.target.value),
                              )
                            }
                            className="w-32 rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-600 dark:bg-zinc-800"
                            aria-label="Display name"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              void handleUpdateDisplayName(user.id)
                            }
                            disabled={editState[user.id] === 'pending'}
                            className="text-xs text-blue-600 hover:underline disabled:opacity-50 dark:text-blue-400"
                          >
                            {editState[user.id] === 'pending'
                              ? 'Saving…'
                              : 'Save'}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setEditOpen((prev) => ({
                                ...prev,
                                [user.id]: false,
                              }))
                            }
                            className="text-xs text-zinc-400 hover:underline"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <span>{user.displayName ?? '—'}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {user.onboardingComplete ? (
                        <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                          Yes
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                          No
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-zinc-500 dark:text-zinc-400">
                      {formatDate(user.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      {user.deactivatedAt ? (
                        <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
                          Deactivated
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                          Active
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {!editOpen[user.id] && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditValues((prev) =>
                                new Map(prev).set(
                                  user.id,
                                  user.displayName ?? '',
                                ),
                              );
                              setEditOpen((prev) => ({
                                ...prev,
                                [user.id]: true,
                              }));
                            }}
                            className="text-xs text-blue-600 hover:underline dark:text-blue-400"
                          >
                            Edit
                          </button>
                        )}
                        {!user.deactivatedAt &&
                          (confirmDeactivate[user.id] ? (
                            <div className="flex items-center gap-2 text-xs">
                              <span className="text-zinc-500 dark:text-zinc-400">
                                Are you sure?
                              </span>
                              <button
                                type="button"
                                onClick={() => void handleDeactivate(user.id)}
                                disabled={
                                  deactivateState[user.id] === 'pending'
                                }
                                className="text-red-600 hover:underline disabled:opacity-50 dark:text-red-400"
                              >
                                {deactivateState[user.id] === 'pending'
                                  ? 'Deactivating…'
                                  : deactivateState[user.id] === 'error'
                                    ? 'Failed — retry'
                                    : 'Yes'}
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setConfirmDeactivate((prev) => ({
                                    ...prev,
                                    [user.id]: false,
                                  }))
                                }
                                disabled={
                                  deactivateState[user.id] === 'pending'
                                }
                                className="text-zinc-400 hover:underline disabled:opacity-50"
                              >
                                No
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                setConfirmDeactivate((prev) => ({
                                  ...prev,
                                  [user.id]: true,
                                }))
                              }
                              disabled={deactivateState[user.id] === 'pending'}
                              className="text-xs text-red-600 hover:underline disabled:opacity-50 dark:text-red-400"
                            >
                              {deactivateState[user.id] === 'pending'
                                ? 'Deactivating…'
                                : deactivateState[user.id] === 'error'
                                  ? 'Failed — retry'
                                  : 'Deactivate'}
                            </button>
                          ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm text-zinc-600 dark:text-zinc-400">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="rounded-lg border border-zinc-200 px-3 py-1.5 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                Previous
              </button>
              <span>
                Page {page + 1} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="rounded-lg border border-zinc-200 px-3 py-1.5 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
