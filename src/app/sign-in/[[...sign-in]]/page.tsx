import { SignIn } from '@clerk/nextjs';
import { Suspense } from 'react';

export default function Page() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Suspense
        fallback={
          <div className="h-[400px] w-[400px] animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800" />
        }
      >
        <SignIn path="/sign-in" />
      </Suspense>
    </div>
  );
}
