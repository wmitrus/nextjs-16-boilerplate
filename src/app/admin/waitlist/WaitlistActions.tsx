'use client';

import { useRouter } from 'next/navigation';
import * as React from 'react';

interface WaitlistActionsProps {
  entryId: string;
  entryEmail: string;
}

type ActionState =
  | 'idle'
  | 'approving'
  | 'rejecting'
  | 'done-approve'
  | 'done-reject'
  | 'error';

export function WaitlistActions({ entryId, entryEmail }: WaitlistActionsProps) {
  const router = useRouter();
  const [state, setState] = React.useState<ActionState>('idle');
  const [errorMessage, setErrorMessage] = React.useState<string>('');

  async function handleAction(action: 'approve' | 'reject') {
    setState(action === 'approve' ? 'approving' : 'rejecting');
    setErrorMessage('');

    try {
      const res = await fetch(
        `/api/admin/waitlist/${entryId}?action=${action}`,
        { method: 'POST' },
      );

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          message?: string;
        };
        throw new Error(
          body.message ?? `Request failed with status ${res.status.toString()}`,
        );
      }

      setState(action === 'approve' ? 'done-approve' : 'done-reject');
      router.refresh();
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setErrorMessage(error.message);
      setState('error');
    }
  }

  if (state === 'done-approve') {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600 dark:text-emerald-400">
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="m4.5 12.75 6 6 9-13.5"
          />
        </svg>
        Approved
      </span>
    );
  }

  if (state === 'done-reject') {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-500 dark:text-zinc-400">
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M6 18 18 6M6 6l12 12"
          />
        </svg>
        Rejected
      </span>
    );
  }

  if (state === 'error') {
    return (
      <div className="flex flex-col items-end gap-1">
        <span className="text-xs text-red-600 dark:text-red-400">
          {errorMessage}
        </span>
        <button
          type="button"
          onClick={() => setState('idle')}
          className="text-xs text-zinc-500 underline hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          Retry
        </button>
      </div>
    );
  }

  const isBusy = state === 'approving' || state === 'rejecting';

  return (
    <div className="flex items-center justify-end gap-2">
      <button
        type="button"
        disabled={isBusy}
        onClick={() => void handleAction('approve')}
        aria-label={`Approve waitlist application from ${entryEmail}`}
        className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        {state === 'approving' ? (
          <svg
            className="h-3.5 w-3.5 animate-spin"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
        ) : (
          <svg
            className="h-3.5 w-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m4.5 12.75 6 6 9-13.5"
            />
          </svg>
        )}
        Approve
      </button>
      <button
        type="button"
        disabled={isBusy}
        onClick={() => void handleAction('reject')}
        aria-label={`Reject waitlist application from ${entryEmail}`}
        className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:border-red-800 dark:hover:bg-red-950 dark:hover:text-red-400"
      >
        {state === 'rejecting' ? (
          <svg
            className="h-3.5 w-3.5 animate-spin"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
        ) : (
          <svg
            className="h-3.5 w-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 18 18 6M6 6l12 12"
            />
          </svg>
        )}
        Reject
      </button>
    </div>
  );
}
