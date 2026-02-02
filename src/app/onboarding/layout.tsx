import { auth, clerkClient } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId, sessionClaims } = await auth();

  if (!userId) {
    redirect('/sign-in');
  }

  let onboardingComplete = sessionClaims?.metadata?.onboardingComplete;

  // If JWT says incomplete, check backend to avoid "read your writes" staleness after form submission
  if (!onboardingComplete) {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    onboardingComplete = user.publicMetadata?.onboardingComplete as boolean;
  }

  if (onboardingComplete === true) {
    redirect('/');
  }

  return (
    <div className="container mx-auto max-w-2xl px-4 py-12">{children}</div>
  );
}
