import { createHash } from 'node:crypto';

import { and, eq, gt, isNull } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { Suspense } from 'react';

import { INFRASTRUCTURE } from '@/core/contracts';
import type { DrizzleDb } from '@/core/db/types';
import { env } from '@/core/env';
import { getAppContainer } from '@/core/runtime/bootstrap';

import { InvalidToken, ResetPasswordClient } from './reset-password-client';

import { passwordResetTokensTable } from '@/modules/auth/infrastructure/drizzle/schema';
import { usersTable } from '@/modules/user/infrastructure/drizzle/schema';

function maskEmail(email: string): string {
  const atIndex = email.indexOf('@');
  if (atIndex < 0) return '***';
  const local = email.slice(0, atIndex);
  const domain = email.slice(atIndex);
  const visible = local.length > 2 ? local.slice(0, 2) : local.slice(0, 1);
  return `${visible}***${domain}`;
}

async function ResetPasswordPageContent({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  await connection();

  if (env.AUTH_PROVIDER !== 'authjs') {
    redirect('/');
  }

  const { token } = await searchParams;

  if (!token) {
    return (
      <PageShell>
        <InvalidToken message="No reset token provided. Please request a new password reset link." />
      </PageShell>
    );
  }

  const tokenHash = createHash('sha256').update(token).digest('hex');

  const db = getAppContainer().resolve<DrizzleDb>(INFRASTRUCTURE.DB);

  const [tokenRecord] = await db
    .select({ userId: passwordResetTokensTable.userId })
    .from(passwordResetTokensTable)
    .where(
      and(
        eq(passwordResetTokensTable.tokenHash, tokenHash),
        gt(passwordResetTokensTable.expiresAt, new Date()),
        isNull(passwordResetTokensTable.usedAt),
      ),
    )
    .limit(1);

  if (!tokenRecord) {
    return (
      <PageShell>
        <InvalidToken message="This password reset link is invalid or has expired. Please request a new one." />
      </PageShell>
    );
  }

  const [user] = await db
    .select({ email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.id, tokenRecord.userId))
    .limit(1);

  if (!user) {
    return (
      <PageShell>
        <InvalidToken message="This password reset link is invalid or has expired. Please request a new one." />
      </PageShell>
    );
  }

  return (
    <PageShell>
      <ResetPasswordClient token={token} maskedEmail={maskEmail(user.email)} />
    </PageShell>
  );
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-gray-950">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Reset Password
          </h1>
        </div>
        {children}
      </div>
    </main>
  );
}

export default function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  return (
    <Suspense fallback={null}>
      <ResetPasswordPageContent searchParams={searchParams} />
    </Suspense>
  );
}
