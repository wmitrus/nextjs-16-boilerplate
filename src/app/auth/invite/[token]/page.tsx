import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { Suspense } from 'react';

import { INFRASTRUCTURE } from '@/core/contracts';
import type { DrizzleDb } from '@/core/db/types';
import { env } from '@/core/env';
import { getAppContainer } from '@/core/runtime/bootstrap';

import { getServerRequestLogContext } from '@/shared/lib/observability/server-request-log-context';

import { buildBootstrapRedirectUrl } from '../../post-auth-redirect';

import { buildInviteSignInUrl, buildInviteSignUpUrl } from './invite-links';
import { InviteAcceptButton } from './InviteAcceptButton';
import { InviteSignOutButton } from './InviteSignOutButton';

import { authOptions } from '@/modules/auth/infrastructure/authjs/auth';
import { DefaultInvitationService } from '@/modules/invitations/infrastructure/DefaultInvitationService';
import { DrizzleInvitationRepository } from '@/modules/invitations/infrastructure/drizzle/DrizzleInvitationRepository';
import { NoOpEmailService } from '@/modules/invitations/infrastructure/NoOpEmailService';

export const metadata: Metadata = {
  title: 'Accept Invitation',
  description: 'Accept your invitation to join.',
};

interface InvitePageProps {
  params: Promise<{ token: string }>;
}

function LoadingInvitePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 dark:bg-gray-950">
      <div className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-8 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="h-8 w-48 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
        <div className="mt-3 h-4 w-full animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
        <div className="mt-2 h-4 w-2/3 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
      </div>
    </main>
  );
}

function InvalidInvitePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 dark:bg-gray-950">
      <div className="w-full max-w-md rounded-lg border border-red-200 bg-white p-8 shadow-sm dark:border-red-900 dark:bg-gray-900">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          Invitation not valid
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          This invitation link has expired, already been used, or is not valid.
        </p>
        <div className="mt-6">
          <Link
            href="/"
            className="text-sm font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400"
          >
            &larr; Back to home
          </Link>
        </div>
      </div>
    </main>
  );
}

interface ValidInvitePageProps {
  email: string;
  expiresAt: Date;
  signUpUrl: string;
  signInUrl: string;
}

interface SignedInInvitePageProps {
  email: string;
  expiresAt: Date;
  token: string;
  redirectUrl: string;
}

function ValidInvitePage({
  email,
  expiresAt,
  signUpUrl,
  signInUrl,
}: ValidInvitePageProps) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 dark:bg-gray-950">
      <div className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-8 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          You&apos;ve been invited
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          You have a pending invitation. Create a new account or sign in with an
          existing one to accept it.
        </p>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-500">
          Invitation for{' '}
          <span className="font-medium text-gray-700 dark:text-gray-300">
            {email}
          </span>
        </p>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-500">
          Expires{' '}
          <span className="font-medium text-gray-700 dark:text-gray-300">
            {expiresAt.toLocaleDateString()}
          </span>
        </p>
        <div className="mt-6 flex flex-col gap-3">
          <Link
            href={signUpUrl}
            className="flex w-full items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none"
          >
            Create account &amp; accept
          </Link>
          <Link
            href={signInUrl}
            className="flex w-full items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Sign in to existing account
          </Link>
        </div>
      </div>
    </main>
  );
}

function SignedInInvitePage({
  email,
  expiresAt,
  token,
  redirectUrl,
}: SignedInInvitePageProps) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 dark:bg-gray-950">
      <div className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-8 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          Accept invitation
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          You are already signed in with the invited email. Accept the
          invitation to continue into the app.
        </p>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-500">
          Invitation for{' '}
          <span className="font-medium text-gray-700 dark:text-gray-300">
            {email}
          </span>
        </p>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-500">
          Expires{' '}
          <span className="font-medium text-gray-700 dark:text-gray-300">
            {expiresAt.toLocaleDateString()}
          </span>
        </p>
        <div className="mt-6 flex flex-col gap-3">
          <InviteAcceptButton token={token} redirectUrl={redirectUrl} />
          <Link
            href="/"
            className="flex w-full items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Cancel
          </Link>
        </div>
      </div>
    </main>
  );
}

interface EmailMismatchPageProps {
  invitedEmail: string;
  currentEmail: string;
  expiresAt: Date;
  signOutCallbackUrl: string;
}

function EmailMismatchPage({
  invitedEmail,
  currentEmail,
  expiresAt,
  signOutCallbackUrl,
}: EmailMismatchPageProps) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 dark:bg-gray-950">
      <div className="w-full max-w-md rounded-lg border border-amber-200 bg-white p-8 shadow-sm dark:border-amber-900 dark:bg-gray-900">
        <div className="flex items-start gap-3">
          <svg
            className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
            />
          </svg>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
              Account mismatch
            </h1>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              You are currently signed in as{' '}
              <span className="font-medium text-gray-800 dark:text-gray-200">
                {currentEmail}
              </span>
              .
            </p>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              This invitation is for{' '}
              <span className="font-medium text-gray-800 dark:text-gray-200">
                {invitedEmail}
              </span>
              .
            </p>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-500">
              Expires{' '}
              <span className="font-medium">
                {expiresAt.toLocaleDateString()}
              </span>
            </p>
          </div>
        </div>
        <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">
          To accept this invitation, sign out and create a new account with{' '}
          <span className="font-medium">{invitedEmail}</span>.
        </p>
        <div className="mt-6 flex flex-col gap-3">
          <InviteSignOutButton callbackUrl={signOutCallbackUrl} />
          <Link
            href="/"
            className="flex w-full items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Cancel &mdash; keep my current account
          </Link>
        </div>
      </div>
    </main>
  );
}

async function InviteTokenPageContent({ params }: InvitePageProps) {
  await connection();
  await getServerRequestLogContext({ pathname: '/auth/invite' });

  const { token } = await params;

  const appUrl = env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

  let invitation: { email: string; expiresAt: Date } | null = null;

  try {
    const container = getAppContainer();
    const db = container.resolve<DrizzleDb>(INFRASTRUCTURE.DB);
    const service = new DefaultInvitationService(
      new DrizzleInvitationRepository(db),
      new NoOpEmailService(),
      { appUrl },
    );
    invitation = await service.validateToken(token);
  } catch {
    return <InvalidInvitePage />;
  }

  if (env.AUTH_PROVIDER === 'authjs') {
    const session = await getServerSession(authOptions);

    if (session?.user?.email) {
      const sessionEmail = session.user.email.toLowerCase();
      const invitedEmail = invitation.email.toLowerCase();

      if (sessionEmail !== invitedEmail) {
        const signOutCallbackUrl = `${appUrl}/auth/invite/${encodeURIComponent(token)}`;
        return (
          <EmailMismatchPage
            invitedEmail={invitation.email}
            currentEmail={session.user.email}
            expiresAt={invitation.expiresAt}
            signOutCallbackUrl={signOutCallbackUrl}
          />
        );
      }

      return (
        <SignedInInvitePage
          email={invitation.email}
          expiresAt={invitation.expiresAt}
          token={token}
          redirectUrl={buildBootstrapRedirectUrl()}
        />
      );
    }
  }

  const inviteAuthProvider =
    env.AUTH_PROVIDER === 'authjs' ? 'authjs' : 'clerk';

  const signUpUrl = buildInviteSignUpUrl(token, inviteAuthProvider);

  const signInUrl = buildInviteSignInUrl(token, inviteAuthProvider);

  return (
    <ValidInvitePage
      email={invitation.email}
      expiresAt={invitation.expiresAt}
      signUpUrl={signUpUrl}
      signInUrl={signInUrl}
    />
  );
}

export default function InviteTokenPage({ params }: InvitePageProps) {
  return (
    <Suspense fallback={<LoadingInvitePage />}>
      <InviteTokenPageContent params={params} />
    </Suspense>
  );
}
