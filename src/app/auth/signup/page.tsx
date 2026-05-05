import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { Suspense } from 'react';

import { INFRASTRUCTURE } from '@/core/contracts';
import type { DrizzleDb } from '@/core/db/types';
import { env } from '@/core/env';
import { getAppContainer } from '@/core/runtime/bootstrap';

import { buildBootstrapRedirectUrl } from '../post-auth-redirect';

import { SignUpClient } from './sign-up-client';

import { authOptions } from '@/modules/auth/infrastructure/authjs/auth';
import { DefaultInvitationService } from '@/modules/invitations/infrastructure/DefaultInvitationService';
import { DrizzleInvitationRepository } from '@/modules/invitations/infrastructure/drizzle/DrizzleInvitationRepository';
import { NoOpEmailService } from '@/modules/invitations/infrastructure/NoOpEmailService';

type SignUpSearchParams = Promise<{ invitation_token?: string }>;

export async function SignUpPageContent({
  searchParams,
}: {
  searchParams: SignUpSearchParams;
}) {
  await connection();

  if (env.AUTH_PROVIDER !== 'authjs') {
    redirect('/');
  }

  const { invitation_token: invitationToken } = await searchParams;

  if (env.REGISTRATION_MODE !== 'open' && !invitationToken) {
    redirect('/auth/signin');
  }

  const session = await getServerSession(authOptions);
  if (session) {
    if (invitationToken) {
      redirect(`/auth/invite/${encodeURIComponent(invitationToken)}`);
    }
    redirect(buildBootstrapRedirectUrl());
  }

  let invitedEmail: string | undefined;
  if (invitationToken) {
    try {
      const container = getAppContainer();
      const db = container.resolve<DrizzleDb>(INFRASTRUCTURE.DB);
      const service = new DefaultInvitationService(
        new DrizzleInvitationRepository(db),
        new NoOpEmailService(),
        { appUrl: env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000' },
      );
      const invitation = await service.validateToken(invitationToken);
      invitedEmail = invitation.email;
    } catch {
      redirect(`/auth/invite/${encodeURIComponent(invitationToken)}`);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-gray-950">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {invitedEmail ? 'Create your account' : 'Create Account'}
          </h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            {invitedEmail
              ? 'Choose a password to accept your invitation'
              : 'Sign up to get started'}
          </p>
        </div>
        <SignUpClient
          invitationToken={invitationToken}
          invitedEmail={invitedEmail}
        />
        {!invitedEmail && (
          <p className="mt-4 text-center text-sm text-gray-600 dark:text-gray-400">
            {'Already have an account? '}
            <a
              href={`/auth/signin?callbackUrl=${encodeURIComponent(buildBootstrapRedirectUrl())}`}
              className="font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400"
            >
              Sign in
            </a>
          </p>
        )}
      </div>
    </main>
  );
}

export default function SignUpPage({
  searchParams,
}: {
  searchParams: SignUpSearchParams;
}) {
  return (
    <Suspense fallback={null}>
      <SignUpPageContent searchParams={searchParams} />
    </Suspense>
  );
}
