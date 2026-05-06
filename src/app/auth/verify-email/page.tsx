import { createHash } from 'node:crypto';

import { eq, sql } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { Suspense } from 'react';

import { INFRASTRUCTURE } from '@/core/contracts';
import type { DrizzleDb } from '@/core/db/types';
import { env } from '@/core/env';
import { resolveServerLogger } from '@/core/logger/di';
import { getAppContainer } from '@/core/runtime/bootstrap';

import {
  emailVerificationTokensTable,
  userCredentialsTable,
} from '@/modules/auth/infrastructure/drizzle/schema';

type VerifyResult =
  | { status: 'verified' }
  | { status: 'ready'; token: string }
  | { status: 'already_used' }
  | { status: 'expired' }
  | { status: 'invalid' }
  | { status: 'no_token' };

function isStatusResult(
  status: string | undefined,
): status is 'already_used' | 'expired' | 'invalid' | 'no_token' {
  return (
    status === 'already_used' ||
    status === 'expired' ||
    status === 'invalid' ||
    status === 'no_token'
  );
}

async function consumeVerificationToken(token: string): Promise<VerifyResult> {
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const db = getAppContainer().resolve<DrizzleDb>(INFRASTRUCTURE.DB);

  return db.transaction(async (tx) => {
    const [consumed] = await tx
      .update(emailVerificationTokensTable)
      .set({ usedAt: sql`NOW()` })
      .where(
        sql`${emailVerificationTokensTable.tokenHash} = ${tokenHash}
          AND ${emailVerificationTokensTable.expiresAt} > NOW()
          AND ${emailVerificationTokensTable.usedAt} IS NULL`,
      )
      .returning();

    if (consumed) {
      await tx
        .update(userCredentialsTable)
        .set({ emailVerified: true })
        .where(eq(userCredentialsTable.userId, consumed.userId));

      resolveServerLogger()
        .child({
          type: 'PAGE',
          category: 'auth',
          module: 'authjs-verify-email',
        })
        .debug(
          { event: 'auth:email_verified', userId: consumed.userId },
          'Email verified successfully',
        );
      return { status: 'verified' };
    }

    const [existing] = await tx
      .select({
        usedAt: emailVerificationTokensTable.usedAt,
        expiresAt: emailVerificationTokensTable.expiresAt,
      })
      .from(emailVerificationTokensTable)
      .where(eq(emailVerificationTokensTable.tokenHash, tokenHash))
      .limit(1);

    if (!existing) {
      return { status: 'invalid' };
    }
    if (existing.usedAt) {
      return { status: 'already_used' };
    }
    return { status: 'expired' };
  });
}

function StatusMessage({ result }: { result: VerifyResult }) {
  if (result.status === 'ready') {
    return (
      <div className="space-y-4 text-center">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Confirm your email address to finish account activation.
        </p>
        <form action={submitVerification} className="space-y-3">
          <input type="hidden" name="token" value={result.token} />
          <button
            type="submit"
            className="block w-full rounded-md bg-blue-600 px-4 py-2 text-center text-sm font-medium text-white hover:bg-blue-700"
          >
            Verify Email
          </button>
        </form>
      </div>
    );
  }

  if (result.status === 'verified') {
    return (
      <div className="space-y-4 text-center">
        <div className="mx-auto w-fit rounded-full bg-green-100 p-3 dark:bg-green-900">
          <svg
            className="h-6 w-6 text-green-600 dark:text-green-300"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Your email has been verified. You can now sign in.
        </p>
        <a
          href="/auth/signin"
          className="block w-full rounded-md bg-blue-600 px-4 py-2 text-center text-sm font-medium text-white hover:bg-blue-700"
        >
          Sign In
        </a>
      </div>
    );
  }

  const messages: Record<
    Exclude<VerifyResult['status'], 'verified' | 'ready'>,
    string
  > = {
    already_used:
      'This verification link has already been used. Please sign in or request a new verification link.',
    expired: 'This verification link has expired. Please request a new one.',
    invalid: 'This verification link is invalid. Please request a new one.',
    no_token:
      'No verification token provided. Please use the link from your verification email.',
  };

  return (
    <div className="space-y-4 text-center">
      <p className="text-sm text-red-600 dark:text-red-400">
        {messages[result.status]}
      </p>
      <a
        href="/auth/verify-email-pending"
        className="block w-full rounded-md border border-gray-300 px-4 py-2 text-center text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-900"
      >
        Request new verification link
      </a>
    </div>
  );
}

async function submitVerification(formData: FormData): Promise<void> {
  'use server';

  await connection();

  if (env.AUTH_PROVIDER !== 'authjs') {
    redirect('/');
  }

  const token = formData.get('token');
  if (typeof token !== 'string' || token.length === 0) {
    redirect('/auth/verify-email?status=no_token');
  }

  const result = await consumeVerificationToken(token);
  if (result.status === 'verified') {
    redirect('/auth/signin?verified=true');
  }

  redirect(`/auth/verify-email?status=${result.status}`);
}

async function VerifyEmailPageContent({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; status?: string }>;
}) {
  await connection();

  if (env.AUTH_PROVIDER !== 'authjs') {
    redirect('/');
  }

  const { token, status } = await searchParams;

  let result: VerifyResult;
  if (isStatusResult(status)) {
    result = { status };
  } else if (!token) {
    result = { status: 'no_token' };
  } else {
    result = { status: 'ready', token };
  }

  return (
    <PageShell>
      <StatusMessage result={result} />
    </PageShell>
  );
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-gray-950">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Email Verification
          </h1>
        </div>
        {children}
      </div>
    </main>
  );
}

export default function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; status?: string }>;
}) {
  return (
    <Suspense fallback={null}>
      <VerifyEmailPageContent searchParams={searchParams} />
    </Suspense>
  );
}
