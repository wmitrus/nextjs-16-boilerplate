'use client';

import { useState } from 'react';

import { buildBootstrapRedirectUrl } from '../post-auth-redirect';

interface SignUpClientProps {
  invitationToken?: string;
  invitedEmail?: string;
}

export function SignUpClient({
  invitationToken,
  invitedEmail,
}: SignUpClientProps) {
  const defaultSignInUrl = `/auth/signin?callbackUrl=${encodeURIComponent(buildBootstrapRedirectUrl())}`;
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const [success, setSuccess] = useState(false);

  const isInviteFlow = Boolean(invitationToken && invitedEmail);

  async function handleSubmit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    setErrorStatus(null);

    const formData = new FormData(event.currentTarget);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    const confirmPassword = formData.get('confirmPassword') as string;

    // eslint-disable-next-line security/detect-possible-timing-attacks
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          ...(invitationToken ? { invitationToken } : {}),
        }),
      });

      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(data.error ?? 'Failed to create account.');
        setErrorStatus(response.status);
        setIsLoading(false);
        return;
      }

      const responseData = data as { message?: string };
      const isAutoVerified =
        responseData.message === 'Account created. You can now sign in.';

      setSuccess(true);
      setTimeout(() => {
        window.location.href = isAutoVerified
          ? defaultSignInUrl
          : '/auth/verify-email-pending';
      }, 1500);
    } catch {
      setError('Network error. Please try again.');
      setIsLoading(false);
    }
  }

  if (success) {
    return (
      <div className="rounded-md bg-green-50 p-4 dark:bg-green-950">
        <p className="text-sm text-green-700 dark:text-green-300">
          {isInviteFlow
            ? 'Account created and invitation accepted. Redirecting…'
            : 'Account created. Email verification is required before sign-in. Redirecting…'}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-md bg-red-50 p-3 dark:bg-red-950">
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
          {errorStatus === 409 && (
            <p className="mt-1 text-sm text-red-700 dark:text-red-300">
              <a
                href={defaultSignInUrl}
                className="font-medium underline hover:no-underline"
              >
                Sign in instead →
              </a>
            </p>
          )}
          {errorStatus === 410 && invitationToken && (
            <p className="mt-1 text-sm text-red-700 dark:text-red-300">
              <a
                href={`/auth/invite/${encodeURIComponent(invitationToken)}`}
                className="font-medium underline hover:no-underline"
              >
                ← Back to invitation
              </a>
            </p>
          )}
        </div>
      )}

      {isInviteFlow ? (
        <div className="rounded-md border border-blue-100 bg-blue-50 px-4 py-3 dark:border-blue-900 dark:bg-blue-950">
          <p className="text-xs font-medium tracking-wide text-blue-500 uppercase dark:text-blue-400">
            Invitation for
          </p>
          <p className="mt-0.5 font-medium text-gray-900 dark:text-gray-100">
            {invitedEmail}
          </p>
          <input type="hidden" name="email" value={invitedEmail} />
        </div>
      ) : (
        <div>
          <label
            htmlFor="email"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          />
        </div>
      )}

      <div>
        <label
          htmlFor="password"
          className="block text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
        />
      </div>
      <div>
        <label
          htmlFor="confirmPassword"
          className="block text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          Confirm Password
        </label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
        />
      </div>
      <button
        type="submit"
        disabled={isLoading}
        className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none disabled:opacity-50 dark:focus:ring-offset-gray-950"
      >
        {isLoading
          ? 'Creating account…'
          : isInviteFlow
            ? 'Create account & accept invitation'
            : 'Create Account'}
      </button>

      {isInviteFlow && (
        <p className="text-center text-xs text-gray-500 dark:text-gray-500">
          Already have an account?{' '}
          <a
            href={defaultSignInUrl}
            className="font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400"
          >
            Sign in instead
          </a>
        </p>
      )}
    </form>
  );
}
