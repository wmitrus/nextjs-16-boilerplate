'use client';

import { signIn } from 'next-auth/react';
import { useState } from 'react';

interface SignInClientProps {
  callbackUrl?: string;
  error?: string;
  verified?: boolean;
}

const ERROR_MESSAGES: Record<string, string> = {
  CredentialsSignin: 'Incorrect email or password.',
  NoCredentials: 'Incorrect email or password.',
  EmailNotVerified:
    'Your email address has not been verified. Please check your inbox or request a new verification link.',
  Default: 'Something went wrong. Please try again.',
};

function resolveErrorMessage(error: string | undefined): string | null {
  if (!error) return null;
  if (Object.hasOwn(ERROR_MESSAGES, error)) {
    return (
      ERROR_MESSAGES[error as keyof typeof ERROR_MESSAGES] ??
      'An error occurred.'
    );
  }
  return ERROR_MESSAGES.Default ?? 'An error occurred.';
}

export function SignInClient({
  callbackUrl,
  error,
  verified,
}: SignInClientProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(
    resolveErrorMessage(error),
  );

  async function handleSubmit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setFormError(null);

    const formData = new FormData(event.currentTarget);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;

    const result = await signIn('credentials', {
      email,
      password,
      callbackUrl: callbackUrl ?? '/',
      redirect: false,
    });

    if (result?.error) {
      const errorMsg = resolveErrorMessage(result.error);
      if (result.error === 'EmailNotVerified') {
        window.location.href = '/auth/verify-email-pending';
        return;
      }
      setFormError(errorMsg);
      setIsLoading(false);
    } else if (result?.url) {
      window.location.href = result.url;
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {verified && !formError && (
        <div className="rounded-md bg-green-50 p-3 dark:bg-green-950">
          <p className="text-sm text-green-700 dark:text-green-300">
            Your email has been verified. You can now sign in.
          </p>
        </div>
      )}
      {formError && (
        <div className="rounded-md bg-red-50 p-3 dark:bg-red-950">
          <p className="text-sm text-red-700 dark:text-red-300">{formError}</p>
        </div>
      )}
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
      <div>
        <div className="flex items-center justify-between">
          <label
            htmlFor="password"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Password
          </label>
          <a
            href="/auth/forgot-password"
            className="text-sm font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400"
          >
            Forgot password?
          </a>
        </div>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
        />
      </div>
      <button
        type="submit"
        disabled={isLoading}
        className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none disabled:opacity-50 dark:focus:ring-offset-gray-950"
      >
        {isLoading ? 'Signing in…' : 'Sign In'}
      </button>
    </form>
  );
}
