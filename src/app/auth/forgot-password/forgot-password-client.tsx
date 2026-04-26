'use client';

import { useState } from 'react';

export function ForgotPasswordClient() {
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [devInfo, setDevInfo] = useState<{
    devToken: string;
    devResetUrl: string;
  } | null>(null);

  async function handleSubmit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);

    const formData = new FormData(event.currentTarget);
    const email = formData.get('email') as string;

    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (response.status === 429) {
        const data = (await response.json()) as { error?: string };
        alert(
          data.error ?? 'Too many requests. Please wait before trying again.',
        );
        setIsLoading(false);
        return;
      }

      const data = (await response.json()) as {
        devToken?: string;
        devResetUrl?: string;
      };

      if (data.devToken && data.devResetUrl) {
        setDevInfo({ devToken: data.devToken, devResetUrl: data.devResetUrl });
      }

      setSubmitted(true);
    } catch {
      setSubmitted(true);
    } finally {
      setIsLoading(false);
    }
  }

  if (submitted) {
    return (
      <div className="space-y-4">
        <div
          role="status"
          className="rounded-md bg-green-50 p-4 dark:bg-green-950"
        >
          <p className="text-sm text-green-700 dark:text-green-300">
            If an account with this email exists, a reset link has been sent.
            Please check your inbox.
          </p>
        </div>
        {devInfo && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-950">
            <p className="mb-2 text-xs font-bold text-amber-800 dark:text-amber-200">
              [DEV ONLY — never in production]
            </p>
            <p className="mb-1 text-xs text-amber-800 dark:text-amber-200">
              Reset link:
            </p>
            <a
              href={devInfo.devResetUrl}
              className="block text-xs break-all text-blue-600 underline dark:text-blue-400"
            >
              {devInfo.devResetUrl}
            </a>
          </div>
        )}
        <p className="text-center text-sm text-gray-600 dark:text-gray-400">
          <a
            href="/auth/signin"
            className="font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400"
          >
            Back to sign in
          </a>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
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
      <button
        type="submit"
        disabled={isLoading}
        className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none disabled:opacity-50 dark:focus:ring-offset-gray-950"
      >
        {isLoading ? 'Sending…' : 'Send Reset Link'}
      </button>
    </form>
  );
}
