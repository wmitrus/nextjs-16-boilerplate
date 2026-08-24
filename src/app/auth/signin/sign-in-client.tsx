'use client';

import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { useCallback, useState } from 'react';

import { env } from '@/core/env';

import { TurnstileWidget } from '@/shared/components/captcha/TurnstileWidget';

import { buildBootstrapRedirectUrl } from '../post-auth-redirect';

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
  CaptchaRequired: 'Please complete the security check below and try again.',
  MfaRequired: 'Enter the 6-digit code from your authenticator app.',
  MfaInvalidCode:
    'That code is not valid. Enter the current code from your authenticator app, or one of your recovery codes.',
  MfaUnavailable:
    'Two-factor authentication is temporarily unavailable. Please contact an administrator.',
  AccountTemporarilyLocked:
    'Too many failed attempts. This account is temporarily locked — please try again later.',
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
  const router = useRouter();
  const postAuthRedirectUrl = buildBootstrapRedirectUrl(callbackUrl);
  const [isLoading, setIsLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(
    resolveErrorMessage(error),
  );
  // Rendered only after the server tells us to (a prior attempt returned
  // CaptchaRequired) -- this repository's account-abuse-control decides
  // when a challenge is needed, not the client. See SEC-34 in
  // docs/ai/general/SECURITY_CODING_PATTERNS.md.
  const [showCaptcha, setShowCaptcha] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  // Bumped to force the widget to issue a fresh token. A Turnstile token is
  // single-use: once the server has redeemed it via `siteverify`, replaying
  // it on the next attempt always fails, so any submit that actually spent
  // one must discard it and re-run the challenge. See SEC-34.
  const [captchaResetSignal, setCaptchaResetSignal] = useState(0);
  // Same rule as the CAPTCHA above: the server decides when a second factor
  // is needed (a prior attempt returned MfaRequired). The client never
  // renders this field on a guess, because doing so would tell an attacker
  // which accounts have MFA before they hold a valid password. See SEC-48.
  const [showMfaCode, setShowMfaCode] = useState(false);

  const discardSpentCaptchaToken = useCallback(() => {
    setCaptchaToken(null);
    setCaptchaResetSignal((signal) => signal + 1);
  }, []);

  const handleCaptchaExpire = useCallback(() => {
    setCaptchaToken(null);
  }, []);

  async function handleSubmit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setFormError(null);

    const formData = new FormData(event.currentTarget);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    const submittedCaptchaToken = captchaToken;
    const totpCode = (formData.get('totpCode') as string | null)?.trim();

    try {
      const result = await signIn('credentials', {
        email,
        password,
        callbackUrl: postAuthRedirectUrl,
        redirect: false,
        ...(submittedCaptchaToken
          ? { cfTurnstileToken: submittedCaptchaToken }
          : {}),
        ...(totpCode ? { totpCode } : {}),
      });

      if (result?.error) {
        const errorMsg = resolveErrorMessage(result.error);
        if (result.error === 'EmailNotVerified') {
          router.replace('/auth/verify-email-pending');
          return;
        }
        if (result.error === 'CaptchaRequired') {
          setShowCaptcha(true);
        }
        // The password was accepted; only the second factor is outstanding.
        // The email and password fields keep their values, so the next
        // submit re-sends them alongside the code.
        if (
          result.error === 'MfaRequired' ||
          result.error === 'MfaInvalidCode'
        ) {
          setShowMfaCode(true);
        }
        // The server consumed this token (successfully or not) -- it can
        // never be replayed, so always ask the widget for a new one.
        if (submittedCaptchaToken) {
          discardSpentCaptchaToken();
        } else if (result.error === 'CaptchaRequired') {
          setCaptchaToken(null);
        }
        setFormError(errorMsg);
        setIsLoading(false);
      } else if (result?.url) {
        const url = new URL(result.url, window.location.origin);
        if (url.origin !== window.location.origin) {
          throw new Error('AuthJS returned a cross-origin callback URL.');
        }
        router.replace(`${url.pathname}${url.search}${url.hash}`);
      } else {
        setFormError(ERROR_MESSAGES.Default);
        setIsLoading(false);
      }
    } catch {
      setFormError(ERROR_MESSAGES.Default);
      setIsLoading(false);
    }
  }

  const captchaRequiredButNotCompleted = showCaptcha && !captchaToken;

  return (
    <form
      onSubmit={(event) => {
        void handleSubmit(event);
      }}
      className="space-y-4"
    >
      {verified && !formError && (
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="rounded-md bg-green-50 p-3 dark:bg-green-950"
        >
          <p className="text-sm text-green-700 dark:text-green-300">
            Your email has been verified. You can now sign in.
          </p>
        </div>
      )}
      {formError && (
        <div
          role="alert"
          aria-live="assertive"
          aria-atomic="true"
          className="rounded-md bg-red-50 p-3 dark:bg-red-950"
        >
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
          autoComplete="current-password"
          required
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
        />
      </div>
      {showMfaCode && (
        <div>
          <label
            htmlFor="totpCode"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Authentication code
          </label>
          <input
            id="totpCode"
            name="totpCode"
            type="text"
            inputMode="text"
            autoComplete="one-time-code"
            autoFocus
            required
            aria-describedby="totpCode-hint"
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          />
          <p
            id="totpCode-hint"
            className="mt-1 text-xs text-gray-500 dark:text-gray-400"
          >
            Enter the 6-digit code from your authenticator app, or one of your
            recovery codes.
          </p>
        </div>
      )}
      {showCaptcha && env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && (
        <TurnstileWidget
          siteKey={env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
          onVerify={setCaptchaToken}
          onExpire={handleCaptchaExpire}
          resetSignal={captchaResetSignal}
        />
      )}
      <button
        type="submit"
        disabled={isLoading || captchaRequiredButNotCompleted}
        className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none disabled:opacity-50 dark:focus:ring-offset-gray-950"
      >
        {isLoading ? 'Signing in…' : 'Sign In'}
      </button>
    </form>
  );
}
