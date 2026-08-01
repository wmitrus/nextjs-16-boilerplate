'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function OrganizationStatusActions({
  organizationId,
  status,
}: {
  organizationId: string;
  status: 'active' | 'archived';
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nextStatus = status === 'active' ? 'archived' : 'active';
  const actionLabel =
    status === 'active' ? 'Archive organization' : 'Restore organization';

  async function handleStatusChange() {
    setPending(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/admin/organizations/${organizationId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: nextStatus }),
        },
      );

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(payload?.error ?? `Error ${response.status.toString()}`);
        return;
      }

      router.refresh();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Current status controls whether this organization stays active in the
        admin catalog.
      </p>
      <div className="flex flex-col items-start gap-2 sm:items-end">
        <button
          type="button"
          onClick={() => void handleStatusChange()}
          disabled={pending}
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          {pending ? 'Saving…' : actionLabel}
        </button>
        {error ? (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        ) : null}
      </div>
    </div>
  );
}
