import { redirect } from 'next/navigation';
import { Suspense } from 'react';

import { container } from '@/core/container';
import { AUTH } from '@/core/contracts';
import type { IdentityProvider } from '@/core/contracts/identity';
import type { UserRepository } from '@/core/contracts/user';

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={null}>
      <OnboardingGuard>{children}</OnboardingGuard>
    </Suspense>
  );
}

async function OnboardingGuard({ children }: { children: React.ReactNode }) {
  const identityProvider = container.resolve<IdentityProvider>(
    AUTH.IDENTITY_PROVIDER,
  );
  const identity = await identityProvider.getCurrentIdentity();

  if (!identity) {
    redirect('/sign-in');
  }

  const userRepository = container.resolve<UserRepository>(
    AUTH.USER_REPOSITORY,
  );
  const user = await userRepository.findById(identity.id);
  const onboardingComplete = user?.onboardingComplete;

  if (onboardingComplete === true) {
    redirect('/');
  }

  return (
    <div className="container mx-auto max-w-2xl px-4 py-12">{children}</div>
  );
}
