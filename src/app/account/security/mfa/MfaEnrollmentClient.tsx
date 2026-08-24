'use client';

import Image from 'next/image';
import { useState } from 'react';

import {
  StepUpProvider,
  useStepUpFetch,
} from '@/shared/components/step-up/StepUpProvider';
import { extractApiErrorMessage } from '@/shared/lib/api/extract-error-message';

/**
 * TOTP enrollment and recovery-code management (SEC-48).
 *
 * Three states, and the transitions between them are all server-decided:
 * `idle` (no factor, or one already enrolled), `pending` (a secret exists but
 * has not been proven), and `codes` (a fresh recovery set, shown exactly
 * once).
 *
 * The recovery codes are rendered from the response and never re-fetched --
 * the server keeps only Argon2id hashes of their secrets, so this is the only
 * moment they exist in readable form. Leaving the page loses them, which is
 * why the copy says so.
 */

interface StartedEnrollment {
  secret: string;
  enrollmentUri: string;
  qrDataUri: string;
}

type View =
  | { kind: 'idle' }
  | { kind: 'pending'; enrollment: StartedEnrollment }
  | { kind: 'codes'; codes: string[] };

async function readError(response: Response, fallback: string) {
  try {
    return extractApiErrorMessage(await response.json()) ?? fallback;
  } catch {
    return fallback;
  }
}

export function MfaEnrollmentClient(props: { initiallyEnrolled: boolean }) {
  // Disabling a factor and regenerating recovery codes are both step-up
  // protected, so this subtree needs the same challenge plumbing the admin
  // panel uses.
  return (
    <StepUpProvider>
      <MfaEnrollmentPanel {...props} />
    </StepUpProvider>
  );
}

function MfaEnrollmentPanel({
  initiallyEnrolled,
}: {
  initiallyEnrolled: boolean;
}) {
  const stepUpFetch = useStepUpFetch();
  const [enrolled, setEnrolled] = useState(initiallyEnrolled);
  const [view, setView] = useState<View>({ kind: 'idle' });
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/auth/mfa/totp', { method: 'POST' });
      if (!response.ok) {
        setError(await readError(response, 'Could not start setup.'));
        return;
      }
      const body = (await response.json()) as { data: StartedEnrollment };
      setView({ kind: 'pending', enrollment: body.data });
      setCode('');
    } finally {
      setBusy(false);
    }
  }

  async function confirm(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/auth/mfa/totp', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      if (!response.ok) {
        setError(await readError(response, 'That code is not valid.'));
        return;
      }
      const body = (await response.json()) as {
        data: { recoveryCodes: string[] };
      };
      setEnrolled(true);
      setView({ kind: 'codes', codes: body.data.recoveryCodes });
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setError(null);
    try {
      const response = await stepUpFetch('/api/auth/mfa/totp', {
        method: 'DELETE',
      });
      if (!response.ok) {
        setError(
          await readError(
            response,
            'Could not remove two-factor authentication.',
          ),
        );
        return;
      }
      setEnrolled(false);
      setView({ kind: 'idle' });
    } finally {
      setBusy(false);
    }
  }

  async function regenerate() {
    setBusy(true);
    setError(null);
    try {
      const response = await stepUpFetch('/api/auth/mfa/recovery-codes', {
        method: 'POST',
      });
      if (!response.ok) {
        setError(await readError(response, 'Could not issue new codes.'));
        return;
      }
      const body = (await response.json()) as {
        data: { recoveryCodes: string[] };
      };
      setView({ kind: 'codes', codes: body.data.recoveryCodes });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 space-y-6">
      {error && (
        <p
          role="alert"
          className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
        >
          {error}
        </p>
      )}

      {view.kind === 'codes' && (
        <section className="rounded-md border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950">
          <h2 className="text-sm font-semibold text-amber-900 dark:text-amber-100">
            Save your recovery codes
          </h2>
          <p className="mt-1 text-sm text-amber-800 dark:text-amber-200">
            Each code works once. This is the only time they are shown — they
            are stored hashed and cannot be displayed again.
          </p>
          <ul className="mt-3 grid grid-cols-1 gap-1 font-mono text-sm text-amber-900 sm:grid-cols-2 dark:text-amber-100">
            {view.codes.map((recoveryCode) => (
              <li key={recoveryCode}>{recoveryCode}</li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => setView({ kind: 'idle' })}
            className="mt-4 rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
          >
            I have saved them
          </button>
        </section>
      )}

      {view.kind === 'pending' && (
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Scan this with your authenticator app
          </h2>
          <Image
            src={view.enrollment.qrDataUri}
            alt="Two-factor authentication setup QR code"
            width={200}
            height={200}
            unoptimized
            className="rounded-md border border-zinc-200 bg-white p-2 dark:border-zinc-800"
          />
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Can&apos;t scan it? Enter this key manually:{' '}
            <code className="font-mono text-zinc-900 dark:text-zinc-100">
              {view.enrollment.secret}
            </code>
          </p>
          <form onSubmit={(event) => void confirm(event)} className="space-y-3">
            <label
              htmlFor="mfa-confirm-code"
              className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Enter the 6-digit code to finish
            </label>
            <input
              id="mfa-confirm-code"
              name="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              value={code}
              onChange={(event) => setCode(event.target.value)}
              className="block w-full max-w-xs rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            />
            <button
              type="submit"
              disabled={busy || code.trim().length === 0}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {busy ? 'Verifying…' : 'Confirm'}
            </button>
          </form>
        </section>
      )}

      {view.kind === 'idle' && (
        <section className="space-y-3">
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            {enrolled
              ? 'An authenticator app is enrolled on this account.'
              : 'No second factor is enrolled on this account yet.'}
          </p>
          <div className="flex flex-wrap gap-2">
            {!enrolled && (
              <button
                type="button"
                onClick={() => void start()}
                disabled={busy}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                Set up authenticator app
              </button>
            )}
            {enrolled && (
              <>
                <button
                  type="button"
                  onClick={() => void regenerate()}
                  disabled={busy}
                  className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  Issue new recovery codes
                </button>
                <button
                  type="button"
                  onClick={() => void disable()}
                  disabled={busy}
                  className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950"
                >
                  Remove two-factor authentication
                </button>
              </>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
