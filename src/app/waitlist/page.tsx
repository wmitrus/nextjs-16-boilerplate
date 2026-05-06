import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';

import { env } from '@/core/env';

import { WaitlistJoinForm } from '@/modules/waitlist/ui/WaitlistJoinForm';

export const metadata: Metadata = {
  title: 'Join the Waitlist',
  description: 'Request early access.',
};

/**
 * Waitlist page — shown when REGISTRATION_MODE=invite-only.
 *
 * - AUTH_PROVIDER=clerk:    renders Clerk's built-in Waitlist component
 * - AUTH_PROVIDER=other:    renders the provider-agnostic WaitlistJoinForm
 * - REGISTRATION_MODE=open: redirects to sign-up (no waitlist needed)
 * - REGISTRATION_MODE=disabled: redirects to registration-closed
 */
export default async function WaitlistPage() {
  if (env.REGISTRATION_MODE === 'open') {
    redirect('/sign-up');
  }

  if (env.REGISTRATION_MODE === 'disabled') {
    redirect('/auth/registration-closed');
  }

  if (env.AUTH_PROVIDER === 'clerk') {
    const { Waitlist } = await import('@clerk/nextjs');
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Suspense
          fallback={
            <div className="h-[400px] w-[400px] animate-pulse rounded-lg bg-zinc-100" />
          }
        >
          <Waitlist />
        </Suspense>
      </div>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <h1 className="text-2xl font-bold text-gray-900">Request Access</h1>
      <p className="mt-2 max-w-md text-center text-gray-600">
        Registration is by invitation only. Join the waitlist and we&apos;ll
        reach out when a spot opens up.
      </p>
      <div className="mt-8">
        <WaitlistJoinForm />
      </div>
    </main>
  );
}
