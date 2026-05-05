'use client';

import { useRouter } from 'next/navigation';
import * as React from 'react';

import type {
  FormErrorsResponse,
  ServerErrorResponse,
} from '@/shared/types/api-response';

import type { InvitationStatus } from '@/modules/invitations/domain/types';

export interface SafeInvitation {
  id: string;
  organizationId: string;
  invitedByUserId: string | null;
  email: string;
  roleId: string;
  status: InvitationStatus;
  expiresAt: Date | string;
  acceptedAt: Date | string | null;
  createdAt: Date | string;
}

interface InvitationsClientProps {
  invitations: SafeInvitation[];
  roles: Array<{ id: string; name: string }>;
}

type SendState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'success'; email: string }
  | { status: 'error'; message: string };

type RevokeState = { [id: string]: 'revoking' | 'done' | 'error' };

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

const STATUS_CLASSES = new Map<InvitationStatus, string>([
  [
    'pending',
    'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  ],
  [
    'accepted',
    'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  ],
  ['revoked', 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'],
  ['expired', 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'],
]);

function statusBadge(status: InvitationStatus) {
  const cls =
    STATUS_CLASSES.get(status) ??
    'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400';
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}
    >
      {status}
    </span>
  );
}

function formatDate(d: Date | string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function InvitationsClient({
  invitations,
  roles,
}: InvitationsClientProps) {
  const router = useRouter();
  const [email, setEmail] = React.useState('');
  const [roleId, setRoleId] = React.useState(roles[0]?.id ?? '');
  const [sendState, setSendState] = React.useState<SendState>({
    status: 'idle',
  });
  const [revokeState, setRevokeState] = React.useState<RevokeState>({});

  async function handleSend(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setSendState({ status: 'submitting' });

    try {
      const res = await fetch('/api/admin/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, roleId }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setSendState({
          status: 'error',
          message: getErrorMessage(data, `Error ${res.status.toString()}`),
        });
        return;
      }

      setSendState({ status: 'success', email });
      setEmail('');
      router.refresh();
    } catch {
      setSendState({
        status: 'error',
        message: 'Network error. Please try again.',
      });
    }
  }

  async function handleRevoke(id: string) {
    setRevokeState((s) => ({ ...s, [id]: 'revoking' }));

    try {
      const res = await fetch(`/api/admin/invitations/${id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        setRevokeState((s) => ({ ...s, [id]: 'error' }));
        return;
      }

      setRevokeState((s) => ({ ...s, [id]: 'done' }));
      router.refresh();
    } catch {
      setRevokeState((s) => ({ ...s, [id]: 'error' }));
    }
  }

  return (
    <div className="space-y-8">
      <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
        <h2 className="mb-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Send Direct Invitation
        </h2>
        <form onSubmit={handleSend} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="invite-email"
                className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
              >
                Email address
              </label>
              <input
                id="invite-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@example.com"
                className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-black focus:ring-1 focus:ring-black focus:outline-none disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                disabled={sendState.status === 'submitting'}
              />
            </div>
            {roles.length > 0 && (
              <div>
                <label
                  htmlFor="invite-role"
                  className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
                >
                  Role
                </label>
                <select
                  id="invite-role"
                  value={roleId}
                  onChange={(e) => setRoleId(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-black focus:ring-1 focus:ring-black focus:outline-none disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                  disabled={sendState.status === 'submitting'}
                >
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {sendState.status === 'error' && (
            <p className="text-sm text-red-600 dark:text-red-400">
              {sendState.message}
            </p>
          )}

          {sendState.status === 'success' && (
            <p className="text-sm text-green-600 dark:text-green-400">
              Invitation sent to {sendState.email}
            </p>
          )}

          <button
            type="submit"
            disabled={sendState.status === 'submitting' || !email || !roleId}
            className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100"
          >
            {sendState.status === 'submitting' ? 'Sending…' : 'Send Invitation'}
          </button>
        </form>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
        <div className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-700">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Invitations
            <span className="ml-2 text-xs font-normal text-zinc-400">
              ({invitations.length})
            </span>
          </h2>
        </div>

        {invitations.length === 0 ? (
          <div className="px-6 py-8 text-center text-sm text-zinc-400 dark:text-zinc-500">
            No invitations sent yet.
          </div>
        ) : (
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {invitations.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center justify-between px-6 py-4"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    {inv.email}
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">
                    Expires {formatDate(inv.expiresAt)} · Sent{' '}
                    {formatDate(inv.createdAt)}
                  </p>
                </div>
                <div className="ml-4 flex items-center gap-3">
                  {statusBadge(inv.status)}
                  {inv.status === 'pending' && (
                    <button
                      onClick={() => handleRevoke(inv.id)}
                      disabled={revokeState[inv.id] === 'revoking'}
                      className="text-xs text-red-600 hover:text-red-800 disabled:opacity-50 dark:text-red-400 dark:hover:text-red-300"
                    >
                      {revokeState[inv.id] === 'revoking'
                        ? 'Revoking…'
                        : 'Revoke'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
