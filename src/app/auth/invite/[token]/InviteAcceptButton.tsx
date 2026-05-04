'use client';

import { useState } from 'react';

interface InviteAcceptButtonProps {
  token: string;
  redirectUrl: string;
}

export function InviteAcceptButton({
  token,
  redirectUrl,
}: InviteAcceptButtonProps) {
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleAccept() {
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/auth/invite/${encodeURIComponent(token)}`,
        {
          method: 'POST',
        },
      );

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          message?: string;
          error?: string;
        };
        setError(
          body.message ?? body.error ?? 'Unable to accept the invitation.',
        );
        setIsSubmitting(false);
        return;
      }

      window.location.assign(redirectUrl);
    } catch {
      setError('Network error. Please try again.');
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-3">
      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : null}
      <button
        type="button"
        onClick={() => void handleAccept()}
        disabled={isSubmitting}
        className="flex w-full items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none disabled:opacity-50"
      >
        {isSubmitting ? 'Accepting…' : 'Accept invitation'}
      </button>
    </div>
  );
}
