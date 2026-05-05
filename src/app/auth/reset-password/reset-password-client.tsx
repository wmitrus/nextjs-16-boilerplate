'use client';

import { useState } from 'react';

interface ResetPasswordClientProps {
  token: string;
  maskedEmail: string;
}

export function ResetPasswordClient({
  token,
  maskedEmail,
}: ResetPasswordClientProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setError(null);

    const formData = new FormData(event.currentTarget);
    const password = formData.get('password') as string;
    const confirmPassword = formData.get('confirmPassword') as string;

    // eslint-disable-next-line security/detect-possible-timing-attacks
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });

      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(
          data.error ??
            'This password reset link is invalid or has expired. Please request a new one.',
        );
        setIsLoading(false);
        return;
      }

      setSuccess(true);
      setTimeout(() => {
        window.location.href = '/auth/signin';
      }, 2000);
    } catch {
      setError('Network error. Please try again.');
      setIsLoading(false);
    }
  }

  if (success) {
    return (
      <div className="rounded-md bg-green-50 p-4 dark:bg-green-950">
        <p className="text-sm text-green-700 dark:text-green-300">
          Password reset successfully! Redirecting to sign in…
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-center text-sm text-gray-600 dark:text-gray-400">
        Resetting password for{' '}
        <span className="font-medium text-gray-900 dark:text-gray-100">
          {maskedEmail}
        </span>
      </p>
      {error && (
        <div className="rounded-md bg-red-50 p-3 dark:bg-red-950">
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
          <p className="mt-1 text-sm text-red-700 dark:text-red-300">
            <a
              href="/auth/forgot-password"
              className="font-medium underline hover:no-underline"
            >
              Request a new reset link →
            </a>
          </p>
        </div>
      )}
      <div>
        <label
          htmlFor="password"
          className="block text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          New Password
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
          Confirm New Password
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
        {isLoading ? 'Resetting password…' : 'Reset Password'}
      </button>
    </form>
  );
}

interface InvalidTokenProps {
  message: string;
}

export function InvalidToken({ message }: InvalidTokenProps) {
  return (
    <div className="space-y-4">
      <div className="rounded-md bg-red-50 p-4 dark:bg-red-950">
        <p className="text-sm text-red-700 dark:text-red-300">{message}</p>
      </div>
      <p className="text-center text-sm text-gray-600 dark:text-gray-400">
        <a
          href="/auth/forgot-password"
          className="font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400"
        >
          Request a new reset link →
        </a>
      </p>
    </div>
  );
}
